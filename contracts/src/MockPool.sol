// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal, owner-priced two-asset "pool" for swapping USDC <-> a
/// mock risk asset on Arc Testnet.
///
/// This intentionally is NOT a constant-product AMM. For a hackathon demo we
/// want the risk-asset price to be a deterministic dial we can turn (to
/// simulate "a price move that breaks the floor") rather than something at
/// the mercy of a third party's testnet liquidity. The owner sets the price;
/// swaps execute at that price as long as the pool holds enough reserves.
contract MockPool is Ownable {
    IERC20 public immutable usdc;
    IERC20 public immutable riskAsset;

    /// @dev Price of 1 whole unit of riskAsset, expressed in USDC's smallest
    /// unit (6 decimals), scaled by 1e6. e.g. if riskAsset "BTC" = $65,000,
    /// price = 65_000 * 1e6.
    uint256 public price;

    event PriceUpdated(uint256 oldPrice, uint256 newPrice, string reason);
    event Swap(address indexed trader, bool usdcToRisk, uint256 amountIn, uint256 amountOut);

    constructor(address usdc_, address riskAsset_, uint256 initialPrice, address initialOwner) Ownable(initialOwner) {
        usdc = IERC20(usdc_);
        riskAsset = IERC20(riskAsset_);
        price = initialPrice;
    }

    /// @notice Simulates a price move (the "price spike" story beat in the
    /// demo). Reason is logged on-chain purely for the audit-trail narrative.
    function setPrice(uint256 newPrice, string calldata reason) external onlyOwner {
        emit PriceUpdated(price, newPrice, reason);
        price = newPrice;
    }

    function quoteUsdcToRisk(uint256 usdcAmountIn) public view returns (uint256) {
        // riskAsset uses its own decimals; usdc is 6 decimals; price is scaled by 1e6.
        return (usdcAmountIn * 1e6 * (10 ** _riskDecimals())) / price / 1e6;
    }

    function quoteRiskToUsdc(uint256 riskAmountIn) public view returns (uint256) {
        return (riskAmountIn * price) / (10 ** _riskDecimals());
    }

    function swapUsdcForRisk(uint256 usdcAmountIn, uint256 minRiskOut) external returns (uint256 riskOut) {
        riskOut = quoteUsdcToRisk(usdcAmountIn);
        require(riskOut >= minRiskOut, "slippage");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountIn), "usdc transferFrom failed");
        require(riskAsset.transfer(msg.sender, riskOut), "risk transfer failed");
        emit Swap(msg.sender, true, usdcAmountIn, riskOut);
    }

    function swapRiskForUsdc(uint256 riskAmountIn, uint256 minUsdcOut) external returns (uint256 usdcOut) {
        usdcOut = quoteRiskToUsdc(riskAmountIn);
        require(usdcOut >= minUsdcOut, "slippage");
        require(riskAsset.transferFrom(msg.sender, address(this), riskAmountIn), "risk transferFrom failed");
        require(usdc.transfer(msg.sender, usdcOut), "usdc transfer failed");
        emit Swap(msg.sender, false, riskAmountIn, usdcOut);
    }

    /// @notice Owner tops up reserves so swaps have something to draw from.
    function seedLiquidity(uint256 usdcAmount, uint256 riskAmount) external onlyOwner {
        if (usdcAmount > 0) require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "usdc seed failed");
        if (riskAmount > 0) {
            require(riskAsset.transferFrom(msg.sender, address(this), riskAmount), "risk seed failed");
        }
    }

    function _riskDecimals() internal view returns (uint8) {
        // IERC20 has no decimals(); riskAsset is expected to be MockRiskAsset (ERC20Metadata).
        (bool ok, bytes memory data) = address(riskAsset).staticcall(abi.encodeWithSignature("decimals()"));
        require(ok, "decimals() failed");
        return abi.decode(data, (uint8));
    }
}
