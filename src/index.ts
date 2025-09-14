import Fastify from "fastify";
import { routes } from "./routes";
import { configManager } from "./config/configManager";
import { ShellExecutor } from "./utils/shell";
import { DatabaseService } from "./services/databaseService";
import cors from "@fastify/cors"; 


async function startServer() {
  try {
    const config = configManager.getConfig();
    const serverConfig = configManager.getServerConfig();

    console.log("🔧 Initializing Proxmox Daemon...");

    try {
      await DatabaseService.connect();
    } catch (dbError) {
      console.warn(
        "⚠️  Warning: Could not connect to database. VM records will not be saved:",
        dbError
      );
    }

    const isProxmoxConnected = await ShellExecutor.validateProxmoxConnection();
    if (!isProxmoxConnected) {
      console.warn(
        "⚠️  Warning: Could not connect to Proxmox. Please ensure qm command is available."
      );
    } else {
      console.log("✅ Proxmox connection validated");
    }

    const fastify = Fastify({
      logger: {
        level: process.env.LOG_LEVEL || "info",
      },
    });

    await fastify.register(cors, { origin: true });
    await fastify.register(routes);

    await fastify.listen({
      port: serverConfig.port,
      host: serverConfig.host,
    });

    console.log(
      `🚀 Proxmox Daemon running at http://${serverConfig.host}:${serverConfig.port}`
    );
    console.log(
      `📋 Available templates: ${Object.keys(config.templates).join(", ")}`
    );
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully...");
  await DatabaseService.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 Received SIGINT, shutting down gracefully...");
  await DatabaseService.disconnect();
  process.exit(0);
});

startServer();
