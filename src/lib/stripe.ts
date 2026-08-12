// Mock Stripe client — demo only, no real charges.
//
// In a real integration this module would:
//   1. import Stripe from 'stripe'
//   2. export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
//   3. call stripe.paymentIntents.create() / .confirm()
//
// For the demo we return a deterministic success response so the checkout
// flow works end-to-end without a Stripe account or secret key.
// The factory's Research agent sees the vendor-swap in the PR diff and scores
// the risk accordingly, triggering a guarded release with a payment-failure-rate
// metric to catch any regressions during rollout.

export interface PaymentResult {
  paymentIntentId: string;
  status: 'succeeded' | 'requires_action' | 'failed';
  demo: true;
}

// Tokenise card details client-side (Stripe.js would do this in production).
// Returns a mock payment method ID — never touches real card data.
export function tokenizeCard(cardNumber: string): string {
  const last4 = cardNumber.replace(/\s/g, '').slice(-4);
  return `pm_demo_${last4}_${Date.now()}`;
}

// Create and confirm a PaymentIntent (mock).
// In production: stripe.paymentIntents.create({ confirm: true, ... })
export async function createAndConfirmPayment(
  _amountCents: number,
  _currency: string,
  paymentMethodId: string,
): Promise<PaymentResult> {
  // Simulate a small network delay so the loading state is visible in demos
  await new Promise((r) => setTimeout(r, 400));

  return {
    paymentIntentId: `pi_demo_${paymentMethodId.slice(-8)}_${Date.now()}`,
    status: 'succeeded',
    demo: true,
  };
}
