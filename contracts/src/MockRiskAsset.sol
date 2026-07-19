// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Stand-in for the "risk sleeve" asset (e.g. a mock BTC/ETH exposure
/// token) used for demo purposes on Arc Testnet, where we don't want to
/// depend on a third-party pool having live liquidity on demo day.
contract MockRiskAsset is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address initialOwner)
        ERC20(name_, symbol_)
        Ownable(initialOwner)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint for seeding the pool / demo wallets. Owner-gated so a
    /// public testnet faucet can't be drained by others, but trivial to
    /// relax for a hackathon if you want a public faucet-style mint.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
