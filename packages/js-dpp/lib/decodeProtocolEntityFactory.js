const ProtocolVersionParsingError = require('./errors/consensus/basic/decode/ProtocolVersionParsingError');
const SerializedObjectParsingError = require('./errors/consensus/basic/decode/SerializedObjectParsingError');
const UnsupportedProtocolVersionError = require('./errors/consensus/basic/decode/UnsupportedProtocolVersionError');
const IncompatibleProtocolVersionError = require('./errors/consensus/basic/decode/IncompatibleProtocolVersionError');
const CompatibleProtocolVersionIsNotDefinedError = require('./errors/CompatibleProtocolVersionIsNotDefinedError');

const { decode } = require('./util/serializer');

function decodeProtocolEntityFactory(versionCompatibilityMap) {
  /**
   * @typedef {decodeProtocolEntity}
   * @param {Buffer} buffer
   * @param {number} currentProtocolVersion
   * @return {[number, Object]}
   */
  function decodeProtocolEntity(buffer, currentProtocolVersion) {
    // Parse protocol version from the first 4 bytes
    let protocolVersion;
    try {
      protocolVersion = buffer.slice(0, 4).readUInt32LE(0);
    } catch (error) {
      const consensusError = new ProtocolVersionParsingError(error.message);

      consensusError.setParsingError(error);

      throw consensusError;
    }

    // Parsed protocol version must be equal or lower than current version
    if (protocolVersion > currentProtocolVersion) {
      throw new UnsupportedProtocolVersionError(
        protocolVersion,
        currentProtocolVersion,
      );
    }

    if (!Object.prototype.hasOwnProperty.call(versionCompatibilityMap, currentProtocolVersion)) {
      throw new CompatibleProtocolVersionIsNotDefinedError(currentProtocolVersion);
    }

    const minimalProtocolVersion = versionCompatibilityMap[currentProtocolVersion];

    // Parsed protocol version must higher or equal to the minimum compatible version
    if (protocolVersion < minimalProtocolVersion) {
      throw new IncompatibleProtocolVersionError(
        protocolVersion,
        minimalProtocolVersion,
      );
    }

    let rawEntity;
    try {
      rawEntity = decode(
        buffer.slice(4, buffer.length),
      );
    } catch (error) {
      const consensusError = new SerializedObjectParsingError(error.message);

      consensusError.setParsingError(error);

      throw consensusError;
    }

    return [protocolVersion, rawEntity];
  }

  return decodeProtocolEntity;
}

module.exports = decodeProtocolEntityFactory;