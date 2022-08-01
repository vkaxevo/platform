const BlockHeadersProvider = require('@dashevo/dapi-client/lib/BlockHeadersProvider/BlockHeadersProvider');
const { Block } = require('@dashevo/dashcore-lib');
const Worker = require('../../Worker');
const logger = require('../../../logger');
const EVENTS = require('../../../EVENTS');

const PROGRESS_UPDATE_INTERVAL = 1000;

const MIN_HEADERS_TO_KEEP = 100;
const MAX_HEADERS_TO_KEEP = 5000;

const STATES = {
  IDLE: 'STATE_IDLE',
  HISTORICAL_SYNC: 'STATE_HISTORICAL_SYNC',
  CONTINUOUS_SYNC: 'STATE_CONTINUOUS_SYNC',
};

class BlockHeadersSyncWorker extends Worker {
  constructor(options) {
    super({
      name: 'BlockHeadersSyncWorker',
      executeOnStart: true,
      firstExecutionRequired: true,
      awaitOnInjection: true,
      workerIntervalTime: 0,
      dependencies: [
        'network',
        'transport',
        'storage',
        'importBlockHeader',
        'chainSyncMediator',
        'walletId',
      ],
      ...options,
    });

    this.maxHeadersToKeep = typeof options.maxHeadersToKeep === 'number'
      ? options.maxHeadersToKeep
      : MAX_HEADERS_TO_KEEP;

    if (this.maxHeadersToKeep < MIN_HEADERS_TO_KEEP) {
      throw new Error(`Max headers to keep must be greater than ${MIN_HEADERS_TO_KEEP}, got ${this.maxHeadersToKeep}`);
    }

    this.syncCheckpoint = -1;
    this.progressUpdateTimeout = null;
    this.state = STATES.IDLE;

    this.blockHeadersProviderErrorHandler = null;
    this.historicalDataObtainedHandler = null;
    this.blockHeadersProviderStopHandler = null;

    this.updateProgress = this.updateProgress.bind(this);
  }

  async onStart() {
    if (this.state !== STATES.IDLE) {
      throw new Error(`Worker is already running: ${this.state}. Please call .onStop() first.`);
    }

    const chainStore = this.storage.getDefaultChainStore();
    let startFrom = this.getStartBlockHeight();
    if (startFrom < this.syncCheckpoint) {
      startFrom = this.syncCheckpoint;
    }

    const bestBlockHeight = typeof chainStore.state.blockHeight === 'number'
      ? chainStore.state.blockHeight : -1;

    if (bestBlockHeight < 1) {
      throw new Error(`Invalid best block height ${bestBlockHeight}`);
    } else if (startFrom > bestBlockHeight) {
      throw new Error(`Start block height ${startFrom} is greater than best block height ${bestBlockHeight}`);
    }

    const { blockHeadersProvider } = this.transport.client;
    blockHeadersProvider.on(
      BlockHeadersProvider.EVENTS.CHAIN_UPDATED,
      this.historicalChainUpdateHandler,
    );

    let stopped = false;
    const historicalSyncPromise = new Promise((resolve, reject) => {
      this.blockHeadersProviderErrorHandler = (e) => reject(e);

      this.blockHeadersProviderStopHandler = () => {
        blockHeadersProvider.removeListener(
          BlockHeadersProvider.EVENTS.CHAIN_UPDATED,
          this.historicalChainUpdateHandler,
        );
        blockHeadersProvider.removeListener(
          BlockHeadersProvider.EVENTS.ERROR,
          this.blockHeadersProviderErrorHandler,
        );
        blockHeadersProvider.removeListener(
          BlockHeadersProvider.EVENTS.HISTORICAL_DATA_OBTAINED,
          this.historicalDataObtainedHandler,
        );

        stopped = true;
        resolve();
      };

      this.historicalDataObtainedHandler = () => {
        blockHeadersProvider.removeListener(
          BlockHeadersProvider.EVENTS.CHAIN_UPDATED,
          this.historicalChainUpdateHandler,
        );
        blockHeadersProvider.removeListener(
          BlockHeadersProvider.EVENTS.ERROR,
          this.blockHeadersProviderErrorHandler,
        );
        blockHeadersProvider.removeListener(
          BlockHeadersProvider.EVENTS.STOPPED,
          this.blockHeadersProviderStopHandler,
        );

        resolve();
      };

      blockHeadersProvider.on(
        BlockHeadersProvider.EVENTS.ERROR,
        this.blockHeadersProviderErrorHandler,
      );
      blockHeadersProvider.once(
        BlockHeadersProvider.EVENTS.HISTORICAL_DATA_OBTAINED,
        this.historicalDataObtainedHandler,
      );
      blockHeadersProvider.once(
        BlockHeadersProvider.EVENTS.STOPPED,
        this.blockHeadersProviderStopHandler,
      );
    });

    await blockHeadersProvider.readHistorical(startFrom, bestBlockHeight);
    this.state = STATES.HISTORICAL_SYNC;

    await historicalSyncPromise;

    this.updateProgress();
    if (!stopped) {
      this.syncCheckpoint = bestBlockHeight;
    }
    this.state = STATES.IDLE;
  }

  async execute() {
    if (this.state !== STATES.IDLE) {
      throw new Error(`Worker is already running: ${this.state}. Please call .onStop() first.`);
    }

    const chainStore = this.storage.getDefaultChainStore();

    const bestBlockHeight = typeof chainStore.state.blockHeight === 'number'
      ? chainStore.state.blockHeight : -1;

    if (this.syncCheckpoint !== bestBlockHeight) {
      throw new Error(`Sync checkpoint is not equal to best block height: ${this.syncCheckpoint} !== ${bestBlockHeight}. Please read historical data first.`);
    }

    const { blockHeadersProvider } = this.transport.client;
    blockHeadersProvider.on(
      BlockHeadersProvider.EVENTS.CHAIN_UPDATED,
      this.continuousChainUpdateHandler,
    );

    this.blockHeadersProviderErrorHandler = (e) => {
      this.parentEvents.emit('error', e);
    };
    blockHeadersProvider.on(
      BlockHeadersProvider.EVENTS.ERROR,
      this.blockHeadersProviderErrorHandler,
    );

    this.blockHeadersProviderStopHandler = () => {
      blockHeadersProvider.removeListener(
        BlockHeadersProvider.EVENTS.CHAIN_UPDATED,
        this.continuousChainUpdateHandler,
      );

      blockHeadersProvider.removeListener(
        BlockHeadersProvider.EVENTS.ERROR,
        this.blockHeadersProviderErrorHandler,
      );

      this.state = STATES.IDLE;
    };

    blockHeadersProvider.once(
      BlockHeadersProvider.EVENTS.STOPPED,
      this.blockHeadersProviderStopHandler,
    );

    await blockHeadersProvider.startContinuousSync(this.syncCheckpoint);
    this.state = STATES.CONTINUOUS_SYNC;
  }

  async onStop() {
    // TODO: handle cancellation of the plugins chain
    // in case we are in the phase of plugins preparation
    const { blockHeadersProvider } = this.transport.client;
    await blockHeadersProvider.stop();
  }

  /**
   * Determines starting point considering options
   * and last save checkpoint
   * @returns {number|number}
   */
  getStartBlockHeight() {
    const chainStore = this.storage.getDefaultChainStore();
    const bestBlockHeight = chainStore.state.blockHeight;

    let height;

    const {
      skipSynchronizationBeforeHeight,
      skipSynchronization,
    } = (this.storage.application.syncOptions || {});

    if (skipSynchronization) {
      logger.debug(`[BlockHeadersSyncWorker] Wallet created from a new mnemonic. Sync only last ${MAX_HEADERS_TO_KEEP} blocks.`);
      const syncFrom = bestBlockHeight - this.maxHeadersToKeep;
      return syncFrom < 1 ? 1 : syncFrom;
    }

    const lastSyncedHeaderHeight = typeof chainStore.state.lastSyncedHeaderHeight === 'number'
      ? chainStore.state.lastSyncedHeaderHeight : -1;

    const skipBefore = typeof skipSynchronizationBeforeHeight === 'number'
      ? skipSynchronizationBeforeHeight : -1;

    if (skipBefore > lastSyncedHeaderHeight) {
      logger.debug(`[BlockHeadersSyncWorker] UNSAFE option skipSynchronizationBeforeHeight is set to ${skipBefore}`);
      height = skipBefore;
    } else if (lastSyncedHeaderHeight > -1) {
      logger.debug(`[BlockHeadersSyncWorker] Last synced header height is ${lastSyncedHeaderHeight}`);
      height = lastSyncedHeaderHeight;
    } else {
      height = 1;
    }

    return height;
  }

  /**
   * Listens for chain updates during the synchronization of historical headers
   */
  historicalChainUpdateHandler() {
    const chainStore = this.storage.getDefaultChainStore();
    const { blockHeadersProvider } = this.transport.client;
    const { spvChain } = blockHeadersProvider;

    const longestChain = spvChain.getLongestChain({ withPruned: true });
    const { startBlockHeight } = spvChain;
    const { lastSyncedHeaderHeight } = chainStore.state;

    // TODO: abstract this in spv chain?
    const totalHeadersCount = startBlockHeight + longestChain.length;
    const syncedHeadersCount = lastSyncedHeaderHeight + 1;
    console.log(`Chain update: ${syncedHeadersCount}/${totalHeadersCount}`);
    if (syncedHeadersCount < totalHeadersCount) {
      // Update headers in the store
      chainStore.state.blockHeaders = longestChain.slice(-MAX_HEADERS_TO_KEEP);

      const newLastSyncedHeaderHeight = totalHeadersCount - 1;

      // Update headers metadata;
      const newHeaders = longestChain.slice(-(totalHeadersCount - syncedHeadersCount));

      chainStore.updateHeadersMetadata(newHeaders, newLastSyncedHeaderHeight);
      chainStore.updateLastSyncedHeaderHeight(newLastSyncedHeaderHeight);

      this.storage.scheduleStateSave();
    }

    this.scheduleProgressUpdate();
  }

  async continuousChainUpdateHandler(newHeaders, batchHeadHeight) {
    try {
      const chainStore = this.storage.getChainStore(this.network.toString());
      const walletStore = this.storage.getWalletStore(this.walletId);

      let newChainHeight = batchHeadHeight;
      if (newHeaders.length > 1) {
        newChainHeight += newHeaders.length - 1;
      }

      const { blockHeight } = chainStore.state;
      // Ignore height overlap in case of the stream reconnected
      if (newChainHeight === blockHeight) {
        return;
      } if (newChainHeight < blockHeight) {
        this.parentEvents.emit(new Error(`New chain height ${newChainHeight} is less than latest height ${blockHeight}`));
        return;
      }

      const rawBlock = await this.transport.getBlockByHeight(newChainHeight);
      const block = new Block(rawBlock);

      // TODO: do we really need it having in mind that wallet holds lastKnownBlock?
      chainStore.state.blockHeight = newChainHeight;
      walletStore.updateLastKnownBlock(newChainHeight);
      chainStore.updateLastSyncedHeaderHeight(newChainHeight);
      this.parentEvents.emit(EVENTS.BLOCKHEIGHT_CHANGED, newChainHeight);
      this.parentEvents.emit(EVENTS.BLOCK, block, newChainHeight);
      logger.debug(`BlockHeadersSyncWorker - setting chain height ${newChainHeight}`);

      const { blockHeadersProvider: { spvChain } } = this.transport.client;
      const { prunedHeaders, orphanChunks } = spvChain;
      const longestChain = spvChain.getLongestChain();
      const totalOrphans = orphanChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const totalChainLength = prunedHeaders.length + longestChain.length + totalOrphans;

      console.log(`[BlockHeadersSyncWorker] Chain height update: ${newChainHeight}, Headers added: ${newHeaders.length}, Total length: ${totalChainLength}`);
      console.log(`[--------------------->] Longest: ${longestChain.length}, Pruned: ${prunedHeaders.length}. Orphans: ${totalOrphans}`);
      // TODO: implement with pruning in mind
      // this.storage.scheduleStateSave();
    } catch (e) {
      console.log(e);
      this.parentEvents.emit('error', e);
    }
  }

  updateProgress() {
    if (this.progressUpdateTimeout) {
      clearTimeout(this.progressUpdateTimeout);
      this.progressUpdateTimeout = null;
    }

    const chainStore = this.storage.getDefaultChainStore();
    const totalHistoricalHeaders = chainStore.state.blockHeight + 1; // Including root block

    const { blockHeadersProvider } = this.transport.client;
    const longestChain = blockHeadersProvider.spvChain.getLongestChain();
    const { prunedHeaders, orphanChunks, startBlockHeight } = blockHeadersProvider.spvChain;

    const totalOrphans = orphanChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const synchronizedHistoricalHeaders = longestChain.length
      + prunedHeaders.length
      + totalOrphans;

    // TODO: test
    let progress = (this.syncCheckpoint + synchronizedHistoricalHeaders - 1)
      / totalHistoricalHeaders;
    progress = Math.round(progress * 1000) / 1000;

    const fetchedHeaders = this.syncCheckpoint + synchronizedHistoricalHeaders - 1;

    logger.debug(`[BlockHeadersSyncWorker] Historical fetch: ${fetchedHeaders}/${totalHistoricalHeaders}. Progress: ${progress}`);
    logger.debug(`[--------------------->] Longest: ${longestChain.length}, Pruned: ${startBlockHeight + prunedHeaders.length}. Orphans: ${totalOrphans}`);
    if (progress === 1) {
      logger.debug(`[--------------------->] last header: ${longestChain[longestChain.length - 1].hash}`);
    }
  }

  scheduleProgressUpdate() {
    if (!this.progressUpdateTimeout) {
      this.progressUpdateTimeout = setTimeout(this.updateProgress, PROGRESS_UPDATE_INTERVAL);
    }
  }
}

BlockHeadersSyncWorker.MAX_HEADERS_TO_KEEP = MAX_HEADERS_TO_KEEP;
BlockHeadersSyncWorker.STATES = STATES;

module.exports = BlockHeadersSyncWorker;
