module t2000::events;

use sui::event;

public struct FeeCollected has copy, drop {
    agent: address,
    operation: u8,
    amount: u64,
    principal: u64,
}

public struct ConfigUpdated has copy, drop {
    field: vector<u8>,
    old_value: u64,
    new_value: u64,
    updated_by: address,
}

public struct ProtocolPaused has copy, drop {
    paused_by: address,
}

public struct ProtocolUnpaused has copy, drop {
    unpaused_by: address,
}

public struct FeesWithdrawn has copy, drop {
    amount: u64,
    recipient: address,
    total_withdrawn: u64,
}

public struct FeeChangeProposed has copy, drop {
    save_bps: u64,
    swap_bps: u64,
    borrow_bps: u64,
    effective_at: u64,
}

public struct AdminTransferProposed has copy, drop {
    current_admin: address,
    proposed_admin: address,
}

public struct AdminTransferAccepted has copy, drop {
    old_admin: address,
    new_admin: address,
}

public(package) fun emit_fee_collected(agent: address, operation: u8, amount: u64, principal: u64) {
    event::emit(FeeCollected { agent, operation, amount, principal });
}

public(package) fun emit_config_updated(field: vector<u8>, old_value: u64, new_value: u64, updated_by: address) {
    event::emit(ConfigUpdated { field, old_value, new_value, updated_by });
}

public(package) fun emit_protocol_paused(paused_by: address) {
    event::emit(ProtocolPaused { paused_by });
}

public(package) fun emit_protocol_unpaused(unpaused_by: address) {
    event::emit(ProtocolUnpaused { unpaused_by });
}

public(package) fun emit_fees_withdrawn(amount: u64, recipient: address, total_withdrawn: u64) {
    event::emit(FeesWithdrawn { amount, recipient, total_withdrawn });
}

public(package) fun emit_fee_change_proposed(save_bps: u64, swap_bps: u64, borrow_bps: u64, effective_at: u64) {
    event::emit(FeeChangeProposed { save_bps, swap_bps, borrow_bps, effective_at });
}

public(package) fun emit_admin_transfer_proposed(current_admin: address, proposed_admin: address) {
    event::emit(AdminTransferProposed { current_admin, proposed_admin });
}

public(package) fun emit_admin_transfer_accepted(old_admin: address, new_admin: address) {
    event::emit(AdminTransferAccepted { old_admin, new_admin });
}
