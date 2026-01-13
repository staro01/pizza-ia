import { z } from "zod";

const OrderItemSchema = z.object({
  productId: z.string().min(1),
  size: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  extras: z.array(z.string()).default([]),
});

export const CreateOrderSchema = z.object({
  orderType: z.enum(["DELIVERY", "TAKEAWAY"]),
  customerName: z.string().min(1),
  customerPhone: z.string().min(6),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  items: z.array(OrderItemSchema).min(1),
});
