const debug = require('debug')('canboatjs:w2k01')
const debugData = require('debug')('canboatjs:w2k01-data')
const { parseCanId, encodeCanId } = require('./canId')
const BitStream = require('bit-buffer').BitStream
const streams = require('memory-streams');
const frameTypeEnum = {
  STANDARD: 'standard',
  EXTENDED: 'extended'
}
const frameKindEnum = {
  DATA: 'data',
  REMOTE: 'remote'
}
const { Duplex } = require('stream');

class ChunkedStream extends Duplex {
    constructor(chunkSize, options) {
        super(options);
        this.chunkSize = chunkSize;
        this.buffer = Buffer.alloc(0);
    }

    _write(chunk, encoding, callback) {
        this.buffer = Buffer.concat([this.buffer, chunk]); // Store incoming data
        this._attemptRead(); // Try emitting chunks immediately
        callback();
    }

    _read(size) {
        this._attemptRead(); // Ensure any remaining chunks are pushed
    }

    _attemptRead() {
        while (this.buffer.length >= this.chunkSize) {
            const chunk = this.buffer.slice(0, this.chunkSize);
            this.buffer = this.buffer.slice(this.chunkSize);
            this.push(chunk);
        }

        // Push remaining data when stream ends
        if (this.buffer.length > 0 && this.writableEnded) {
            this.push(this.buffer);
            this.buffer = Buffer.alloc(0);
        }
    }

    _final(callback) {
        this._attemptRead(); // Flush remaining data
        this.push(null); // Signal end of stream
        callback();
    }
}

class N2KEcan {
  constructor(cb) {
    this.stream =  new ChunkedStream(13)
    this.stream.on('data', (chunk) => this.handleFrame(chunk, cb));
  }

  process (data) {
    if ( debugData.enabled ) {
      debugData('Received: (' + data.length + ') ' + Buffer.from(data).toString('hex'))
    }
    this.stream.write(data)
  }

  handleFrame(buffer, cb) {
    let inOffset = 0
    if (buffer.length < 13) {
      debug('Stream is corrupted')
      return
    }

    let header = buffer.readUInt8(inOffset++)
    let frameType
    if ((header & (1<<7)) != 0)
      frameType = frameTypeEnum.EXTENDED
    else
      frameType = frameTypeEnum.STANDARD
    let frameKind
    if ((header & (1<<6)) != 0)
      frameKind = frameKindEnum.REMOTE
    else
      frameKind = frameKindEnum.DATA

    let dataLength =  header & 0xF;
    if (dataLength > 8)
        dataLength = 8;
    
    debug(`Frame ${frameType}:${frameKind}. size: ${dataLength}`)

    let canid = buffer.readUInt32LE(inOffset+=4)    
    let pgnData = Buffer.alloc(dataLength)
    buffer.copy(pgnData, 0, inOffset, dataLength)
    let info = parseCanId(canid)
    info.timestamp = new Date().toISOString()
    let last = { pgn:info, length: pgnData.length, data: pgnData, coalesced: true }
    cb && cb(last)
  }  
}
module.exports = N2KEcan;


