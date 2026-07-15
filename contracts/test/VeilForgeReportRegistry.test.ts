import { expect } from 'chai';
import { ethers } from 'hardhat';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';

describe('VeilForgeReportRegistry', function () {
  async function deployFixture() {
    const [alice, bob] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('VeilForgeReportRegistry');
    const registry = await factory.deploy();
    await registry.waitForDeployment();
    return { registry, alice, bob };
  }

  const projectId = ethers.id('veilforge-demo');
  const sourceHash = ethers.id('source');
  const reportHash = ethers.id('report');

  it('publishes and reads a report', async function () {
    const { registry, alice } = await deployFixture();

    await expect(registry.publishReport(projectId, sourceHash, reportHash, 91n, 'ipfs://report', '0.1.0'))
      .to.emit(registry, 'ReportPublished')
      .withArgs(projectId, alice.address, sourceHash, reportHash, 91n, 'ipfs://report', '0.1.0', anyValue);

    const report = await registry.latestReport(projectId);
    expect(report.sourceHash).to.equal(sourceHash);
    expect(report.reportHash).to.equal(reportHash);
    expect(report.score).to.equal(91n);
    expect(report.reportURI).to.equal('ipfs://report');
    expect(report.submitter).to.equal(alice.address);
    expect(report.scannerVersion).to.equal('0.1.0');
  });

  it('allows the original submitter to update a project', async function () {
    const { registry } = await deployFixture();
    await registry.publishReport(projectId, sourceHash, reportHash, 50, '', '0.1.0');
    const nextHash = ethers.id('next-report');
    await registry.publishReport(projectId, sourceHash, nextHash, 90, 'https://example.com', '0.2.0');
    const report = await registry.latestReport(projectId);
    expect(report.reportHash).to.equal(nextHash);
    expect(report.score).to.equal(90n);
  });

  it('prevents another wallet from overwriting a project', async function () {
    const { registry, alice, bob } = await deployFixture();
    await registry.connect(alice).publishReport(projectId, sourceHash, reportHash, 80, '', '0.1.0');
    await expect(
      registry.connect(bob).publishReport(projectId, sourceHash, ethers.id('other'), 90, '', '0.1.0'),
    )
      .to.be.revertedWithCustomError(registry, 'ProjectOwnedByAnotherSubmitter')
      .withArgs(alice.address);
  });

  it('rejects invalid hashes and scores', async function () {
    const { registry } = await deployFixture();
    await expect(registry.publishReport(ethers.ZeroHash, sourceHash, reportHash, 50, '', '0.1.0')).to.be.revertedWithCustomError(
      registry,
      'ZeroProjectId',
    );
    await expect(registry.publishReport(projectId, ethers.ZeroHash, reportHash, 50, '', '0.1.0')).to.be.revertedWithCustomError(
      registry,
      'ZeroSourceHash',
    );
    await expect(registry.publishReport(projectId, sourceHash, ethers.ZeroHash, 50, '', '0.1.0')).to.be.revertedWithCustomError(
      registry,
      'ZeroReportHash',
    );
    await expect(registry.publishReport(projectId, sourceHash, reportHash, 101, '', '0.1.0'))
      .to.be.revertedWithCustomError(registry, 'ScoreOutOfRange')
      .withArgs(101n);
  });
});

