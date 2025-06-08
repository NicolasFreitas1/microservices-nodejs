import "@opentelemetry/auto-instrumentations-node/register";

import { trace } from "@opentelemetry/api";
import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import { z } from "zod";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { orders } from "../broker/channels/orders.ts";
import { channels } from "../broker/channels/index.ts";
import { schema } from "../db/schema/index.ts";
import { db } from "../db/client.ts";
import { randomUUID } from "node:crypto";
import { dispatchOrderCreated } from "../broker/messages/order-created.ts";
import { tracer } from "../tracer/tracer.ts";
import { setTimeout } from "node:timers/promises";

const app = fastify().withTypeProvider<ZodTypeProvider>();

app.setSerializerCompiler(serializerCompiler);
app.setValidatorCompiler(validatorCompiler);

app.register(fastifyCors, { origin: "*" });

app.get("/health", () => {
  return "OK";
});

app.post(
  "/orders",
  {
    schema: {
      body: z.object({
        amount: z.number(),
      }),
    },
  },
  async (request, reply) => {
    const { amount } = request.body;

    console.log("Creating order with amount:", amount);

    const orderId = randomUUID();

    await db.insert(schema.orders).values({
      id: orderId,
      amount,
      customerId: "1dcea25f-26b9-417c-bce1-a5a4f1fe3b89",
    });

    trace.getActiveSpan()?.setAttribute("order_id", orderId);

    const span = tracer.startSpan("Acho que deu pau");

    await setTimeout(2000);

    span.end();

    dispatchOrderCreated({
      amount,
      customer: {
        id: "1dcea25f-26b9-417c-bce1-a5a4f1fe3b89",
      },
      orderId,
    });

    return reply.status(201).send();
  }
);

app.listen({ host: "0.0.0.0", port: 3333 }).then(() => {
  console.log("[Orders] HTTP Server is running!");
});
