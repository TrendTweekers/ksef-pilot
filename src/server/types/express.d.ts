import type { Shop } from "@prisma/client";

declare global {
  namespace Express {
    interface Locals {
      shop?: Shop;
    }
  }
}
