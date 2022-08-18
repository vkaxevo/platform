const EventEmitter = require('events');
const { expect } = require('chai');

const { SPVError } = require('@dashevo/dash-spv');

const BlockHeadersProvider = require('../../../lib/BlockHeadersProvider/BlockHeadersProvider');
const BlockHeadersReader = require('../../../lib/BlockHeadersProvider/BlockHeadersReader');
const getHeadersFixture = require('../../../lib/test/fixtures/getHeadersFixture');

describe('BlockHeadersProvider - unit', () => {
  let blockHeadersProvider;
  let headers;

  beforeEach(function () {
    blockHeadersProvider = new BlockHeadersProvider();
    blockHeadersProvider.setSpvChain({
      addHeaders: this.sinon.stub().callsFake((newHeaders) => newHeaders),
      hashesByHeight: {
        0: '0x000000001',
      },
      reset: this.sinon.spy(),
    });

    const blockHeadersReader = new EventEmitter();
    blockHeadersReader.readHistorical = this.sinon.spy();
    blockHeadersReader.subscribeToNew = this.sinon.spy();
    blockHeadersReader.stopReadingHistorical = this.sinon.spy();
    blockHeadersReader.unsubscribeFromNew = this.sinon.spy();

    this.sinon.spy(blockHeadersReader, 'on');
    this.sinon.spy(blockHeadersReader, 'once');
    this.sinon.spy(blockHeadersReader, 'removeAllListeners');
    this.sinon.spy(blockHeadersReader, 'removeListener');

    blockHeadersProvider.setBlockHeadersReader(blockHeadersReader);
    blockHeadersProvider.setCoreMethods({
      subscribeToBlockHeadersWithChainLocks: this.sinon.spy(),
    });
    headers = getHeadersFixture();
    this.sinon.spy(blockHeadersProvider, 'emit');
    this.sinon.spy(blockHeadersProvider, 'ensureChainRoot');
  });

  describe('#readHistorical', () => {
    it('should start historical sync and hook on events', async () => {
      await blockHeadersProvider.readHistorical(1, 5);
      const { blockHeadersReader } = blockHeadersProvider;
      expect(blockHeadersProvider.ensureChainRoot).to.have.been.called();
      expect(blockHeadersReader.on).to.have.been
        .calledWith(BlockHeadersReader.EVENTS.BLOCK_HEADERS);
      expect(blockHeadersReader.on).to.have.been
        .calledWith(BlockHeadersReader.EVENTS.ERROR);
      expect(blockHeadersReader.once).to.have.been
        .calledWith(BlockHeadersReader.EVENTS.HISTORICAL_DATA_OBTAINED);
      expect(blockHeadersReader.readHistorical)
        .to.have.been.calledWith(1, 5);
      expect(blockHeadersProvider.state).to.equal(BlockHeadersProvider.STATES.HISTORICAL_SYNC);
    });

    it('should not allow running historical sync if already running', async () => {
      await blockHeadersProvider.readHistorical(2, 5);
      await expect(blockHeadersProvider.readHistorical(2, 5)).to.be.rejected();
    });

    it('should not allow running historical sync if core methods have not been provided', async () => {
      blockHeadersProvider.setCoreMethods();
      await expect(blockHeadersProvider.readHistorical(2, 5)).to.be.rejected();
    });

    it('should handle HISTORICAL_DATA_OBTAINED event', async () => {
      await blockHeadersProvider.readHistorical(2, 5);
      const { blockHeadersReader } = blockHeadersProvider;
      blockHeadersReader.emit(BlockHeadersReader.EVENTS.HISTORICAL_DATA_OBTAINED);
      expect(blockHeadersProvider.emit)
        .to.have.been.calledWith(BlockHeadersProvider.EVENTS.HISTORICAL_DATA_OBTAINED);
      expect(blockHeadersProvider.state).to.equal(BlockHeadersProvider.STATES.IDLE);
    });
  });

  describe('#startContinuousSync', () => {
    it('should start continuous sync and hook on events', async () => {
      await blockHeadersProvider.startContinuousSync(100);

      const { blockHeadersReader } = blockHeadersProvider;

      expect(blockHeadersProvider.ensureChainRoot).to.have.been.called();
      expect(blockHeadersReader.on).to.have.been
        .calledWith(BlockHeadersReader.EVENTS.BLOCK_HEADERS);
      expect(blockHeadersReader.on).to.have.been
        .calledWith(BlockHeadersReader.EVENTS.ERROR);

      expect(blockHeadersReader.subscribeToNew)
        .to.have.been.calledWith(100);
      expect(blockHeadersProvider.state)
        .to.equal(BlockHeadersProvider.STATES.CONTINUOUS_SYNC);
    });

    it('should not allow running historical sync if already running', async () => {
      await blockHeadersProvider.startContinuousSync(100);
      await expect(blockHeadersProvider.startContinuousSync(100)).to.be.rejected();
    });

    it('should not allow running historical sync if core methods have not been provided', async () => {
      blockHeadersProvider.setCoreMethods(null);
      await expect(blockHeadersProvider.startContinuousSync(100)).to.be.rejected();
    });
  });

  describe('#stop', () => {
    it('should stop historical sync', async () => {
      await blockHeadersProvider.readHistorical(1, 5);
      const { blockHeadersReader } = blockHeadersProvider;

      await blockHeadersProvider.stop();

      expect(blockHeadersReader.stopReadingHistorical).to.have.been.calledOnce();
      expect(blockHeadersReader.removeListener)
        .to.have.been.calledWith(BlockHeadersReader.EVENTS.ERROR);
      expect(blockHeadersReader.removeListener)
        .to.have.been.calledWith(BlockHeadersReader.EVENTS.BLOCK_HEADERS);
      expect(blockHeadersReader.removeAllListeners)
        .to.have.been.calledWith(BlockHeadersReader.EVENTS.HISTORICAL_DATA_OBTAINED);
      expect(blockHeadersProvider.state).to.equal(BlockHeadersProvider.STATES.IDLE);
      expect(blockHeadersProvider.emit)
        .to.have.been.calledWith(BlockHeadersProvider.EVENTS.STOPPED);
      expect(blockHeadersProvider.blockHeadersReader).to.equal(null);
    });

    it('should stop continuous sync', async () => {
      await blockHeadersProvider.startContinuousSync(100);
      const { blockHeadersReader } = blockHeadersProvider;

      await blockHeadersProvider.stop();

      expect(blockHeadersReader.unsubscribeFromNew).to.have.been.calledOnce();
      expect(blockHeadersReader.removeListener)
        .to.have.been.calledWith(BlockHeadersReader.EVENTS.ERROR);
      expect(blockHeadersReader.removeListener)
        .to.have.been.calledWith(BlockHeadersReader.EVENTS.BLOCK_HEADERS);
      expect(blockHeadersProvider.state).to.equal(BlockHeadersProvider.STATES.IDLE);
      expect(blockHeadersProvider.emit)
        .to.have.been.calledWith(BlockHeadersProvider.EVENTS.STOPPED);
      expect(blockHeadersProvider.blockHeadersReader).to.equal(null);
    });
  });

  describe('#ensureChainRoot', () => {
    it('should reset SPV chain in case header at specified height is missing', async () => {
      blockHeadersProvider.ensureChainRoot(2);
      expect(blockHeadersProvider.spvChain.reset)
        .to.have.been.calledOnceWith(2);
    });
  });

  describe('#handleHeaders', () => {
    it('should add headers to the spv chain and emit CHAIN_UPDATED event', () => {
      blockHeadersProvider.handleHeaders({ headers, headHeight: 1 }, () => {});
      expect(blockHeadersProvider.spvChain.addHeaders).to.have.been.calledWith(headers, 1);
      expect(blockHeadersProvider.emit).to.have.been.calledWith('CHAIN_UPDATED', headers, 1);
    });

    it('should correctly calculate headHeight in case spv chain ignored some headers', () => {
      let addedHeaders;
      blockHeadersProvider.spvChain.addHeaders
        .callsFake((newHeaders) => {
          addedHeaders = newHeaders.slice(0, -1);
          return addedHeaders;
        });
      blockHeadersProvider.handleHeaders({ headers, headHeight: 1 }, () => {});
      expect(blockHeadersProvider.emit).to.have.been.calledWith('CHAIN_UPDATED', addedHeaders, 2);
    });

    it('should not emit CHAIN_UPDATED in case spv chain ignored new headers', () => {
      blockHeadersProvider.spvChain.addHeaders.returns([]);
      blockHeadersProvider.handleHeaders({ headers, headHeight: 1 }, () => {});
      expect(blockHeadersProvider.emit).to.not.have.been.calledWith('CHAIN_UPDATED');
    });

    it('should reject headers in case of SPVError', () => {
      blockHeadersProvider.spvChain.addHeaders.throws(new SPVError('test'));
      blockHeadersProvider.handleHeaders({ headers, headHeight: 1 }, (err) => {
        expect(err).to.be.an.instanceOf(SPVError);
      });
    });

    it('should emit error in case of other errors', () => {
      const err = new Error('test');
      blockHeadersProvider.spvChain.addHeaders.throws(err);
      blockHeadersProvider.on('error', () => {});

      blockHeadersProvider.handleHeaders(headers, 1);
      expect(blockHeadersProvider.emit).to.have.been.calledWith('error', err);
    });
  });
});