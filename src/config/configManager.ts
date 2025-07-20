import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { EMBEDDED_CONFIGS } from "./embeddedConfigs";

dotenv.config();

export interface TemplateConfig {
  id: number;
  name: string;
  description: string;
  arch: string;
  default_user: string;
  storage?: string;
}

export interface NetworkConfig {
  bridge: string;
  model: string;
  vlan: number;
  speed: string;
}

export interface TemplateConfig {
  id: number;
  name: string;
  description: string;
  arch: string;
  default_user: string;
  storage?: string;
  network?: Partial<NetworkConfig>;
}

export interface DefaultsConfig {
  cores: number;
  memory: number;
  disk_size: string;
  storage: string;
  network: NetworkConfig;
}

export interface TemplatesYamlConfig {
  templates: Record<string, TemplateConfig>;
  defaults: DefaultsConfig;
}

export interface AppConfig {
  templates: Record<string, TemplateConfig>;
  defaults: DefaultsConfig;
  server: {
    port: number;
    host: string;
  };
  proxmox: {
    bridge: string;
    storage: string;
  };
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    try {
      let yamlContent: string;

      const yamlPath = path.join(process.cwd(), "config", "templates.yaml");

      if (fs.existsSync(yamlPath)) {
        console.log("📋 Loading config from file:", yamlPath);
        yamlContent = fs.readFileSync(yamlPath, "utf8");
      } else {
        console.log("📋 Loading embedded config (binary mode)");
        yamlContent = EMBEDDED_CONFIGS.templates;
      }

      const yamlConfig = yaml.load(yamlContent) as TemplatesYamlConfig;

      const templates = { ...yamlConfig.templates };

      const config: AppConfig = {
        templates,
        defaults: yamlConfig.defaults,
        server: {
          port: parseInt(process.env.PORT || "3000"),
          host: process.env.HOST || "0.0.0.0",
        },
        proxmox: {
          bridge: process.env.BRIDGE_NAME || yamlConfig.defaults.network.bridge,
          storage: process.env.STORAGE_NAME || "local-lvm",
        },
      };

      return config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public getTemplate(osName: string): TemplateConfig {
    const template = this.config.templates[osName.toLowerCase()];
    if (!template) {
      const availableTemplates = Object.keys(this.config.templates).join(", ");
      throw new Error(
        `Unsupported OS: ${osName}. Available templates: ${availableTemplates}`
      );
    }
    return template;
  }

  public getNetworkConfig(osName?: string): NetworkConfig {
    const defaults = this.config.defaults.network;

    if (osName) {
      const template = this.getTemplate(osName);
      if (template.network) {
        return {
          bridge: template.network.bridge || defaults.bridge,
          model: template.network.model || defaults.model,
          vlan:
            template.network.vlan !== undefined
              ? template.network.vlan
              : defaults.vlan,
          speed: template.network.speed || defaults.speed,
        };
      }
    }

    return defaults;
  }

  public getTemplateStorage(osName: string): string {
    const template = this.getTemplate(osName);
    return (
      template.storage ||
      this.config.defaults.storage ||
      this.config.proxmox.storage
    );
  }

  public getTemplateId(osName: string): number {
    return this.getTemplate(osName).id;
  }

  public getAllTemplates(): Record<string, TemplateConfig> {
    return this.config.templates;
  }

  public getDefaults(): DefaultsConfig {
    return this.config.defaults;
  }

  public getProxmoxConfig() {
    return this.config.proxmox;
  }

  public getServerConfig() {
    return this.config.server;
  }

  public reloadConfig(): void {
    this.config = this.loadConfig();
  }
}

export const configManager = ConfigManager.getInstance();
export default configManager;
