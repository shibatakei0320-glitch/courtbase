import "server-only";
import Stripe from "stripe";

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY が未設定です");
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}
