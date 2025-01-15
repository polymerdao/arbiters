// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ReentrancyGuard} from "openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";
import {ICrossL2Prover} from "vibc-core-smart-contracts/contracts/interfaces/ICrossL2Prover.sol";
import {
    OnchainCrossChainOrder,
    GaslessCrossChainOrder,
    ResolvedCrossChainOrder,
    IOriginSettler,
    IDestinationSettler,
    Output,
    FillInstruction
} from "./ERC7683.sol";
import {BasicClaim} from "the-compact/src/types/Claims.sol";
import {ITheCompactClaims} from "the-compact/src/interfaces/ITheCompactClaims.sol";
import {Bytes} from "optimism/packages/contracts-bedrock/src/libraries/Bytes.sol";

contract PolymerArbiter is IOriginSettler, IDestinationSettler, ReentrancyGuard {
    struct Order {
        bytes32 claimHash;
        uint256 destinationChainId;
        bytes32 destinationSettler;
        address token;
        address recipient;
        uint256 amount;
    }

    bytes32 constant ORDER_TYPE_HASH = keccak256(
        "Order(bytes32 claimHash,uint256 destinationChainId,bytes32 destinationSettler,address token,address recipient,uint256 amount)"
    );

    error InvalidOrderId();
    error OrderAlreadyFilled();
    error InvalidEventSender();
    error InvalidCounterpartyEvent();
    error InsufficientValue();
    error TransferFailed();


    event FillExecuted(
        bytes32 indexed orderId
    );

    // Track filled orders on destination chain
    mapping(bytes32 => bool) public filledOrders;

    ICrossL2Prover public immutable CROSS_L2_PROVER;
    ITheCompactClaims public immutable COMPACT;

    constructor(ICrossL2Prover crossL2Prover_, ITheCompactClaims compact_) {
        CROSS_L2_PROVER = crossL2Prover_;
        COMPACT = compact_;
    }

    // Open a fill. Note that the actual native ETH is held within the Compact. 
    function open(OnchainCrossChainOrder calldata order) external override nonReentrant {
        ResolvedCrossChainOrder memory resolvedOrder = _createResolvedOrder(
            msg.sender,
            order
        );

        emit Open(keccak256(order.orderData), resolvedOrder);
    }

    function openFor(
        GaslessCrossChainOrder calldata,
        bytes calldata,
        bytes calldata
    ) external pure override {
        revert("Gasless orders not supported");
    }

    function resolve(OnchainCrossChainOrder calldata order) 
        external 
        view 
        override 
        returns (ResolvedCrossChainOrder memory) 
    {
        return _createResolvedOrder(msg.sender, order);
    }

    function resolveFor(
        GaslessCrossChainOrder calldata,
        bytes calldata
    ) external pure override returns (ResolvedCrossChainOrder memory) {
        revert("Gasless orders not supported");
    }

    // Destination chain functions
    function fill(
        bytes32 orderId,
        bytes calldata originData,
        bytes calldata 
    ) external override nonReentrant {
        if (filledOrders[orderId]) revert OrderAlreadyFilled();

        OnchainCrossChainOrder memory order = abi.decode(originData, (OnchainCrossChainOrder));
        
        // Verify orderDataType matches our Order type
        require(order.orderDataType == ORDER_TYPE_HASH, "Invalid order type");

        // Decode the concrete order data
        Order memory concreteOrder = abi.decode(order.orderData, (Order));

        // Verify order matches orderId
        if (keccak256(order.orderData) != orderId) revert InvalidOrderId();

        // Mark as filled before external calls
        filledOrders[orderId] = true;

        // Transfer ETH to recipient
        (bool success,) = concreteOrder.recipient.call{value: concreteOrder.amount}("");
        if (!success) revert TransferFailed();

        emit FillExecuted(orderId);
    }

    function claim(
        bytes32 orderId,
        uint256 logIndex,
        bytes calldata proof,
        BasicClaim calldata claimData
    ) external nonReentrant {
        // Verify the fill proof from destination chain
        (
            ,
            address emittingContract,
            bytes[] memory topics,
        ) = CROSS_L2_PROVER.validateEvent(logIndex, proof);

        // Verify event came from this contract on destination chain
        if (emittingContract != address(this)) revert InvalidEventSender();

        // Verify FillExecuted event with correct orderId
        bytes[] memory expectedTopics = new bytes[](2);
        expectedTopics[0] = bytes.concat(FillExecuted.selector);
        expectedTopics[1] = bytes.concat(orderId);

        if (!Bytes.equal(abi.encode(topics), abi.encode(expectedTopics))) {
            revert InvalidCounterpartyEvent();
        }

        // Process claim through The Compact
        COMPACT.claim(claimData);
    }

    function _createResolvedOrder(
        address user,
        OnchainCrossChainOrder memory order
    ) internal view returns (ResolvedCrossChainOrder memory) {
        // Verify orderDataType matches our Order type
        require(order.orderDataType == ORDER_TYPE_HASH, "Invalid order type");

        // Decode the concrete order data
        Order memory concreteOrder = abi.decode(order.orderData, (Order));
        require(concreteOrder.token == address(0), "Only native token supported");

        FillInstruction[] memory instructions = new FillInstruction[](1);
        instructions[0] = FillInstruction({
            destinationChainId: uint64(concreteOrder.destinationChainId),
            destinationSettler: concreteOrder.destinationSettler,
            originData: abi.encode(concreteOrder)
        });

        return ResolvedCrossChainOrder({
            user: user,
            originChainId: block.chainid,
            openDeadline: 0,
            fillDeadline: order.fillDeadline,
            orderId: keccak256(abi.encode(order)),
            minReceived: new Output[](0),
            maxSpent: new Output[](0),
            fillInstructions: instructions
        });
    }
}
