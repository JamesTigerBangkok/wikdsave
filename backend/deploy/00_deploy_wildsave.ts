import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const baseTokenURI = "ipfs://YOUR_BASE_CID/";

  log(`Deploying WildSaveRegistry from ${deployer} ...`);

  await deploy("WildSaveRegistry", {
    from: deployer,
    args: [baseTokenURI],
    log: true,
    waitConfirmations: 2,
  });
};

export default func;
func.tags = ["WildSave"];


