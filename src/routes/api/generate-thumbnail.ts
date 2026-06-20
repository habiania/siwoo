import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate-thumbnail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt: string };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing key", { status: 500 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            prompt: `Korean e-commerce product thumbnail, square format, clean white background, bold Korean text, high contrast, promotional banner style. Product: ${prompt}`,
          }),
        });

        if (!upstream.ok) {
          return new Response(await upstream.text(), { status: upstream.status });
        }
        const data = await upstream.json();
        return Response.json(data);
      },
    },
  },
});