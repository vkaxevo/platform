const BlockchainReaderMediatorMock = require('../../../../lib/test/mock/BlockchainReaderMediatorMock');

const SyncState = require('../../../../lib/sync/state/SyncState');
const ReaderMediator = require('../../../../lib/blockchain/reader/BlockchainReaderMediator');

const getBlockFixtures = require('../../../../lib/test/fixtures/getBlockFixtures');
const attachSyncHandlers = require('../../../../lib/sync/state/attachSyncHandlers');

describe('attachSyncHandlers', () => {
  let blocks;
  let syncState;
  let syncStateRepositoryMock;
  let readerMediatorMock;

  beforeEach(function beforeEach() {
    blocks = getBlockFixtures();

    readerMediatorMock = new BlockchainReaderMediatorMock(this.sinon);
    readerMediatorMock.getState().getBlocks.returns(blocks);

    // Mock SyncState
    syncState = new SyncState([], new Date());
    this.sinon.stub(syncState, 'setBlocks');
    this.sinon.stub(syncState, 'updateLastSyncAt');

    // Mock SyncStateRepository
    class SyncStateRepository {
    }

    syncStateRepositoryMock = new SyncStateRepository();
    syncStateRepositoryMock.store = this.sinon.stub();

    this.sinon.useFakeTimers({ toFake: ['Date'] });
  });

  it('should store sync state when next block has processed', async () => {
    attachSyncHandlers(readerMediatorMock, syncState, syncStateRepositoryMock);

    await readerMediatorMock.originalEmitSerial(ReaderMediator.EVENTS.BLOCK_END, blocks[0]);

    expect(syncState.setBlocks).to.be.calledOnce();
    expect(syncState.setBlocks).to.be.calledWith(blocks);

    expect(syncStateRepositoryMock.store).to.be.calledOnce();
    expect(syncStateRepositoryMock.store).to.be.calledWith(syncState);
  });

  it('should store sync state when stale block has processed', async () => {
    attachSyncHandlers(readerMediatorMock, syncState, syncStateRepositoryMock);

    await readerMediatorMock.originalEmitSerial(ReaderMediator.EVENTS.BLOCK_STALE, blocks[0]);

    expect(syncState.setBlocks).to.be.calledOnce();
    expect(syncState.setBlocks).to.be.calledWith(blocks);

    expect(syncStateRepositoryMock.store).to.be.calledOnce();
    expect(syncStateRepositoryMock.store).to.be.calledWith(syncState);
  });

  it('should update lastSyncAt when sync has completed', async () => {
    attachSyncHandlers(readerMediatorMock, syncState, syncStateRepositoryMock);

    await readerMediatorMock.originalEmitSerial(
      ReaderMediator.EVENTS.END,
      blocks[blocks.length - 1].height,
    );

    expect(syncState.updateLastSyncAt).to.be.calledOnce();
    expect(syncState.updateLastSyncAt).to.be.calledWith(new Date());

    expect(syncStateRepositoryMock.store).to.be.calledOnce();
    expect(syncStateRepositoryMock.store).to.be.calledWith(syncState);
  });
});