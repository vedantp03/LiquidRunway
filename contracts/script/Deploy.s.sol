// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockRiskAsset} from "../src/MockRiskAsset.sol";
import {MockPool} from "../src/MockPool.sol";

/// @notice Deploys the mock risk asset + pool to Arc Testnet and seeds them
/// with initial liquidity + a starting price.
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $ARC_TESTNET_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast
contract Deploy is Script {
    // 65,000 USDC per whole unit of risk asset, scaled by 1e6.
    uint256 constant INITIAL_PRICE = 65_000 * 1e6;
    uint256 constant SEED_RISK_AMOUNT = 10 * 1e8; // 10 units, 8 decimals
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        address deployer = msg.sender;

        vm.startBroadcast();

        MockRiskAsset riskAsset = new MockRiskAsset("Mock BTC", "mBTC", 8, deployer);
        MockPool pool = new MockPool(USDC, address(riskAsset), INITIAL_PRICE, deployer);

        riskAsset.mint(deployer, SEED_RISK_AMOUNT);
        riskAsset.approve(address(pool), SEED_RISK_AMOUNT);
        pool.seedLiquidity(0, SEED_RISK_AMOUNT);

        vm.stopBroadcast();

        console.log("MockRiskAsset deployed at:", address(riskAsset));
        console.log("MockPool deployed at:", address(pool));
        console.log("Seed these into .env as MOCK_RISK_TOKEN_ADDRESS / MOCK_POOL_ADDRESS");
    }
}
