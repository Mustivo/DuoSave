-- DuoSave Migration: Multi-Member Support & Loan Approval Workflow
-- Run this in Supabase: Dashboard -> SQL Editor -> New Query -> Paste & Run.

-- 1. Remove 2-member limit to allow linking multiple users/partners to a vault
DROP TRIGGER IF EXISTS vault_two_max ON vault_members;
DROP FUNCTION IF EXISTS enforce_two_members();

-- 2. Update loans status check constraint to support pending, active, repaid, and rejected statuses
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE loans ADD CONSTRAINT loans_status_check 
  CHECK (status IN ('pending', 'active', 'repaid', 'rejected'));

-- 3. Set default status for newly created loans to 'pending'
ALTER TABLE loans ALTER COLUMN status SET DEFAULT 'pending';

-- 4. Create atomic approve_loan function
CREATE OR REPLACE FUNCTION approve_loan(p_loan uuid, p_user uuid)
RETURNS loans LANGUAGE plpgsql AS $$
DECLARE
  v_avail numeric;
  v_loan loans;
BEGIN
  -- Lock loan row for update
  SELECT * INTO v_loan FROM loans WHERE id = p_loan FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan request not found';
  END IF;
  
  IF v_loan.status <> 'pending' THEN
    RAISE EXCEPTION 'This loan is not pending approval (current status: %)', v_loan.status;
  END IF;
  
  IF v_loan.borrower_id = p_user THEN
    RAISE EXCEPTION 'You cannot approve your own loan request. A partner must approve it.';
  END IF;

  -- Lock vault and verify balance
  PERFORM 1 FROM vaults WHERE id = v_loan.vault_id FOR UPDATE;
  SELECT available INTO v_avail FROM vault_balances WHERE vault_id = v_loan.vault_id;
  
  IF v_loan.amount > v_avail THEN
    RAISE EXCEPTION 'Not enough vault savings to approve this loan. Available: %', v_avail;
  END IF;

  -- Activate loan (which atomically updates vault_balances)
  UPDATE loans SET status = 'active' WHERE id = p_loan RETURNING * INTO v_loan;
  RETURN v_loan;
END $$;

-- 5. Create atomic reject_loan function
CREATE OR REPLACE FUNCTION reject_loan(p_loan uuid, p_user uuid)
RETURNS loans LANGUAGE plpgsql AS $$
DECLARE
  v_loan loans;
BEGIN
  SELECT * INTO v_loan FROM loans WHERE id = p_loan FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan request not found';
  END IF;
  
  IF v_loan.status <> 'pending' THEN
    RAISE EXCEPTION 'This loan is not pending approval';
  END IF;
  
  IF v_loan.borrower_id = p_user THEN
    RAISE EXCEPTION 'Borrowers cannot reject their own loan. Use cancel instead.';
  END IF;

  UPDATE loans SET status = 'rejected' WHERE id = p_loan RETURNING * INTO v_loan;
  RETURN v_loan;
END $$;

