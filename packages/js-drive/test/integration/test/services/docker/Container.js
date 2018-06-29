const Docker = require('dockerode');

const removeContainers = require('../../../../../lib/test/services/docker/removeContainers');
const DashCoreInstanceOptions = require('../../../../../lib/test/services/dashCore/DashCoreInstanceOptions');
const MongoDbInstanceOptions = require('../../../../../lib/test/services/mongoDb/MongoDbInstanceOptions');
const Container = require('../../../../../lib/test/services/docker/Container');

describe('Container', function main() {
  this.timeout(40000);

  before(removeContainers);

  const options = new DashCoreInstanceOptions();
  const mongoDbOptions = new MongoDbInstanceOptions();
  const imageName = options.getContainerImageName();
  const mongoDbImageName = mongoDbOptions.getContainerImageName();
  const { name: networkName } = options.getContainerNetworkOptions();
  const { name: mongoDbNetworkName } = mongoDbOptions.getContainerNetworkOptions();
  const containerOptions = options.getContainerOptions();
  const mongoDbContainerOptions = mongoDbOptions.getContainerOptions();

  describe('before start', () => {
    const container = new Container(networkName, imageName, containerOptions);

    it('should not crash if stop', async () => {
      await container.stop();
    });

    it('should not crash if remove', async () => {
      await container.remove();
    });

    it('should return null if getIp', () => {
      const ip = container.getIp();
      expect(ip).to.be.null();
    });
  });

  describe('usage', () => {
    const container = new Container(networkName, imageName, containerOptions);

    after(async () => container.remove());

    it('should start a BaseInstance with DashCoreInstanceOptions network options', async () => {
      await container.start();
      const { name, driver } = options.getContainerNetworkOptions();
      const dockerNetwork = new Docker().getNetwork(name);
      const { Driver } = await dockerNetwork.inspect();
      const { NetworkSettings: { Networks } } = await container.details();
      const networks = Object.keys(Networks);
      expect(Driver).to.equal(driver);
      expect(networks.length).to.equal(1);
      expect(networks[0]).to.equal(name);
    });

    it('should start an instance with the DashCoreInstanceOptions options', async () => {
      await container.start();
      const { Args } = await container.details();
      expect(Args).to.deep.equal([
        `-port=${options.getDashdPort()}`,
        `-rpcuser=${options.getRpcUser()}`,
        `-rpcpassword=${options.getRpcPassword()}`,
        '-rpcallowip=0.0.0.0/0',
        '-regtest=1',
        '-keypool=1',
        `-rpcport=${options.getRpcPort()}`,
        `-zmqpubrawtx=tcp://0.0.0.0:${options.getZmqPorts().rawtx}`,
        `-zmqpubrawtxlock=tcp://0.0.0.0:${options.getZmqPorts().rawtxlock}`,
        `-zmqpubhashblock=tcp://0.0.0.0:${options.getZmqPorts().hashblock}`,
        `-zmqpubhashtx=tcp://0.0.0.0:${options.getZmqPorts().hashtx}`,
        `-zmqpubhashtxlock=tcp://0.0.0.0:${options.getZmqPorts().hashtxlock}`,
        `-zmqpubrawblock=tcp://0.0.0.0:${options.getZmqPorts().rawblock}`,
      ]);
    });

    it('should not crash if start is called multiple times', async () => {
      await container.start();
      await container.start();
    });

    it('should stop the container', async () => {
      await container.stop();
      const { State } = await container.details();
      expect(State.Status).to.equal('exited');
    });

    it('should start after stop', async () => {
      await container.start();
      const { State } = await container.details();
      expect(State.Status).to.equal('running');
    });

    it('should start after remove', async () => {
      await container.remove();
      await container.start();
      const { State } = await container.details();
      expect(State.Status).to.equal('running');
    });

    it('should return container IP', () => {
      expect(container.getIp()).to.be.equal(container.getIp());
    });

    it('should remove the container', async () => {
      await container.remove();

      let error;
      try {
        await container.details();
      } catch (err) {
        error = err;
      }
      expect(error.message).to.equal('Container not found');
    });
  });

  describe('containers removal', () => {
    const containerOne = new Container(networkName, imageName, containerOptions);
    const containerTwo = new Container(networkName, imageName, containerOptions);

    let sandbox;
    beforeEach(function before() {
      sandbox = this.sinon;
    });
    after(async () => {
      await Promise.all([
        containerOne.remove(),
        containerTwo.remove(),
      ]);
    });

    it('should call createContainer only once when start/stop/start', async () => {
      const createContainerSpy = sandbox.spy(containerOne, 'create');

      await containerOne.start();
      await containerOne.stop();
      await containerOne.start();

      expect(createContainerSpy.callCount).to.equal(1);
    });

    it('should remove container if port if busy', async () => {
      containerTwo.ports = containerOne.ports;
      const removeContainerSpy = sandbox.spy(containerTwo, 'removeContainer');

      let error;
      try {
        await containerTwo.start();
      } catch (err) {
        error = err;
      }

      expect(error.statusCode).to.equal(500);
      expect(removeContainerSpy.callCount).to.be.equal(1);
    });

    it('should remove its volumes upon calling remove method', async () => {
      const docker = new Docker();

      const container =
        new Container(mongoDbNetworkName, mongoDbImageName, mongoDbContainerOptions);

      await container.start();

      const containerDetails = await container.details();
      const containerVolumeNames = containerDetails.Mounts.map(mount => mount.Name);

      await container.remove();

      const listVolumesResponse = await docker.listVolumes();
      const volumeList = listVolumesResponse.Volumes || [];
      const currentVolumeNames = volumeList.map(volume => volume.Name);

      containerVolumeNames.forEach((name) => {
        expect(currentVolumeNames).to.not.include(name);
      });
    });
  });
});