const EventEmitter = require('events');

class BlockHeadersStreamMock extends EventEmitter {
  constructor() {
    super();

    // onError minified events list
    this.f = [];
    // onEnd minified events list
    this.c = [];
  }

  cancel() {
    const err = new Error();
    err.code = 1;
    this.emit(BlockHeadersStreamMock.EVENTS.error, err);
  }

  end() {
    this.emit('end');
    this.removeAllListeners();
  }

  destroy(e) {
    this.emit('end');
    this.removeAllListeners();
    if (e) {
      this.emit(BlockHeadersStreamMock.EVENTS.error, e);
    }
  }

  sendHeaders(headers) {
    this.emit(BlockHeadersStreamMock.EVENTS.data, {
      getBlockHeaders: () => ({
        getHeadersList: () => headers.map((header) => header.toBuffer()),
      }),
    });
  }

  finish() {
    this.emit(BlockHeadersStreamMock.EVENTS.end);
  }
}

BlockHeadersStreamMock.EVENTS = {
  cancel: 'cancel',
  data: 'data',
  end: 'end',
  error: 'error',
};

module.exports = BlockHeadersStreamMock;