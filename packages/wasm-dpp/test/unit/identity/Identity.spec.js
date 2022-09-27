const { default: loadWasmDpp } = require('../../../dist');
const generateRandomIdentifierAsync = require('../../../lib/test/utils/generateRandomIdentifierAsync');

const IdentityPublicKey = require('@dashevo/dpp/lib/identity/IdentityPublicKey');
const protocolVersion = require('@dashevo/dpp/lib/version/protocolVersion');

const serializer = require('@dashevo/dpp/lib/util/serializer');
const hash = require('@dashevo/dpp/lib/util/hash');

describe('Identity', () => {
  let rawIdentity;
  let identity;
  let hashMock;
  let encodeMock;
  let metadataFixture;
  let Identity;
  let Metadata;
  // let IdentityPublicKeyWasm;

  before(async () => {
    ({ Identity, Metadata /* IdentityPublicKey: IdentityPublicKeyWasm */ } = await loadWasmDpp());
  });

  beforeEach(async function beforeEach() {
    rawIdentity = {
      protocolVersion: protocolVersion.latestVersion,
      id: await generateRandomIdentifierAsync(),
      publicKeys: [
        {
          id: 0,
          type: IdentityPublicKey.TYPES.ECDSA_SECP256K1,
          data: Buffer.alloc(36).fill('a'),
          purpose: IdentityPublicKey.PURPOSES.AUTHENTICATION,
          securityLevel: IdentityPublicKey.SECURITY_LEVELS.MASTER,
          readOnly: false,
        },
      ],
      balance: 0,
      revision: 0,
    };

    identity = new Identity(rawIdentity);

    metadataFixture = new Metadata(42, 0);

    identity.setMetadata(metadataFixture);

    encodeMock = this.sinonSandbox.stub(serializer, 'encode');
    hashMock = this.sinonSandbox.stub(hash, 'hash');
  });

  afterEach(() => {
    encodeMock.restore();
    hashMock.restore();
  });

  describe('#constructor', () => {
    it('should set variables from raw model', () => {
      const instance = new Identity(rawIdentity);

      expect(instance.getId().toBuffer()).to.deep.equal(rawIdentity.id.toBuffer());
      expect(instance.getPublicKeys().map((pk) => pk.toObject())).to.deep.equal(
        rawIdentity.publicKeys.map((rawPublicKey) => new IdentityPublicKey(rawPublicKey).toObject()),
      );
    });
  });

  describe('#getId', () => {
    it('should return set id', () => {
      identity = new Identity(rawIdentity);
      expect(identity.getId().toBuffer()).to.deep.equal(rawIdentity.id.toBuffer());
    });
  });

  describe('#getPublicKeys', () => {
    it('should return set public keys', () => {
      expect(identity.getPublicKeys().map(pk => pk.toObject())).to.deep.equal(
        rawIdentity.publicKeys.map((rawPublicKey) => new IdentityPublicKey(rawPublicKey)),
      );
    });
  });

  describe('#setPublicKeys', () => {
    it('should set public keys', () => {
      identity.setPublicKeys(42);
      expect(identity.getPublicKeys()).to.equal(42);
    });
  });

  describe('#getPublicKeyById', () => {
    it('should return a public key for a given id', () => {
      const key = identity.getPublicKeyById(0);

      expect(key.toObject()).to.be.deep.equal(new IdentityPublicKey(rawIdentity.publicKeys[0]));
    });

    it("should return undefined if there's no key with such id", () => {
      const key = identity.getPublicKeyById(3);
      expect(key).to.be.undefined();
    });
  });

  describe('#toBuffer', () => {
    it('should return serialized Identity', () => {
      const encodeMockData = Buffer.from('42');
      encodeMock.returns(encodeMockData); // for example

      const result = identity.toBuffer();

      const identityDataToEncode = identity.toObject();
      delete identityDataToEncode.protocolVersion;

      const protocolVersionUInt32 = Buffer.alloc(4);
      protocolVersionUInt32.writeUInt32LE(identity.getProtocolVersion(), 0);

      expect(result).to.deep.equal(Buffer.concat([protocolVersionUInt32, encodeMockData]));
    });
  });

  describe('#hash', () => {
    it('should return hex string of a buffer return by serialize', () => {
      const buffer = Buffer.from('someString');

      encodeMock.returns(buffer);
      hashMock.returns(buffer);

      const result = identity.hash();

      const identityDataToEncode = identity.toObject();
      delete identityDataToEncode.protocolVersion;

      const protocolVersionUInt32 = Buffer.alloc(4);
      protocolVersionUInt32.writeUInt32LE(identity.getProtocolVersion(), 0);

      expect(result).to.deep.equal(buffer);
    });
  });

  describe('#toObject', () => {
    it('should return plain object representation', () => {
      expect(identity.toObject()).to.deep.equal(rawIdentity);
    });
  });

  describe('#toJSON', () => {
    it('should return json representation', () => {
      const jsonIdentity = identity.toJSON();

      expect(jsonIdentity).to.deep.equal({
        protocolVersion: protocolVersion.latestVersion,
        id: rawIdentity.id.toString(),
        publicKeys: [
          {
            id: 0,
            type: IdentityPublicKey.TYPES.ECDSA_SECP256K1,
            data: rawIdentity.publicKeys[0].data.toString('base64'),
            purpose: IdentityPublicKey.PURPOSES.AUTHENTICATION,
            securityLevel: IdentityPublicKey.SECURITY_LEVELS.MASTER,
            readOnly: false,
          },
        ],
        balance: 0,
        revision: 0,
      });
    });
  });

  describe('#getBalance', () => {
    it('should return set identity balance', () => {
      identity.setBalance(42);
      expect(identity.getBalance()).to.equal(42);
    });
  });

  describe('#setBalance', () => {
    it('should set identity balance', () => {
      identity.setBalance(42);
      expect(identity.getBalance()).to.equal(42);
    });
  });

  describe('#increaseBalance', () => {
    it('should increase identity balance', () => {
      const result = identity.increaseBalance(42);

      expect(result).to.equal(42);
      expect(identity.getBalance()).to.equal(42);
    });
  });

  describe('#reduceBalance', () => {
    it('should reduce identity balance', () => {
      identity.setBalance(42);

      const result = identity.reduceBalance(2);

      expect(result).to.equal(40);
      expect(identity.getBalance()).to.equal(40);
    });
  });

  describe('#setMetadata', () => {
    it('should set metadata', () => {
      const otherMetadata = new Metadata(43, 1);

      identity.setMetadata(otherMetadata);

      expect(identity.getMetadata()).to.deep.equal(otherMetadata);
    });
  });

  describe('#getMetadata', () => {
    it('should get metadata', () => {
      expect(identity.getMetadata()).to.deep.equal(metadataFixture);
    });
  });

  describe('#getPublicKeyMaxId', () => {
    it('should get the biggest public key ID', () => {
      identity.publicKeys.push(
        new IdentityPublicKey({
          id: 99,
          type: IdentityPublicKey.TYPES.ECDSA_SECP256K1,
          data: Buffer.alloc(36).fill('a'),
          purpose: IdentityPublicKey.PURPOSES.AUTHENTICATION,
          securityLevel: IdentityPublicKey.SECURITY_LEVELS.MASTER,
          readOnly: false,
        }),
        new IdentityPublicKey({
          id: 50,
          type: IdentityPublicKey.TYPES.ECDSA_SECP256K1,
          data: Buffer.alloc(36).fill('a'),
          purpose: IdentityPublicKey.PURPOSES.AUTHENTICATION,
          securityLevel: IdentityPublicKey.SECURITY_LEVELS.MASTER,
          readOnly: false,
        }),
      );

      const maxId = identity.getPublicKeyMaxId();

      const publicKeyIds = identity.getPublicKeys().map((publicKey) => publicKey.getId());

      expect(Math.max(...publicKeyIds)).to.equal(maxId);
    });
  });
});
