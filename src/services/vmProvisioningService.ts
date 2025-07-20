import { runCommand } from "../utils/shell";
import { configManager } from "../config/configManager";
import { VMIdManager, sanitizeVMName } from "../utils/helpers";
import { ProvisionOptions, ProvisionResult } from "../types/api";
import { DatabaseService } from "./databaseService";

export class VMProvisioningService {
  public static async provisionVM(
    opts: ProvisionOptions
  ): Promise<ProvisionResult> {
    const vmid = await VMIdManager.getNextVMId();
    const template = configManager.getTemplate(opts.os);
    const defaults = configManager.getDefaults();
    const proxmoxConfig = configManager.getProxmoxConfig();
    const networkConfig = configManager.getNetworkConfig(opts.os);

    const finalNetworkConfig = {
      bridge: networkConfig.bridge,
      model: networkConfig.model,
      vlan:
        opts.network?.vlan !== undefined
          ? opts.network.vlan
          : networkConfig.vlan,
      speed: opts.network?.speed || networkConfig.speed,
    };

    const finalConfig = {
      ...opts,
      name: sanitizeVMName(opts.name),
      cores: opts.cores || defaults.cores,
      memory: opts.memory || defaults.memory,
      username: opts.username || template.default_user,
      diskSize: opts.diskSize || defaults.disk_size,
      network: finalNetworkConfig,
    };

    try {
      console.log(
        `🔧 Provisioning VM ${vmid} with template ${template.name} (ID: ${template.id})`
      );
      console.log(`📊 Configuration:`, {
        cores: finalConfig.cores,
        memory: finalConfig.memory,
        diskSize: finalConfig.diskSize,
        network: `${finalConfig.network.bridge} (VLAN: ${finalConfig.network.vlan}, Speed: ${finalConfig.network.speed}Mb/s)`,
      });

      await this.cloneTemplate(template.id, vmid, finalConfig.name);
      await this.configureVM(vmid, finalConfig, proxmoxConfig);
      await this.setupCloudInit(vmid, finalConfig, proxmoxConfig);
      await this.startVM(vmid);

      const result: ProvisionResult = {
        vmid,
        status: "running",
        message: `VM ${vmid} has been successfully provisioned and started`,
        config: {
          os: opts.os,
          name: finalConfig.name,
          cores: finalConfig.cores,
          memory: finalConfig.memory,
          hostname: finalConfig.hostname,
          username: finalConfig.username,
          network: {
            bridge: finalConfig.network.bridge,
            vlan: finalConfig.network.vlan,
            speed: finalConfig.network.speed,
          },
        },
      };

      console.log(
        `✅ VM ${vmid} provisioned successfully on ${finalConfig.network.bridge} (VLAN ${finalConfig.network.vlan})`
      );
      return result;
    } catch (error) {
      console.error(`❌ Failed to provision VM ${vmid}:`, error);

      try {
        console.log(`🧹 Attempting cleanup of failed VM ${vmid}...`);
        await runCommand(`qm stop ${vmid} --skiplock || true`);
        await runCommand(`qm destroy ${vmid} --skiplock || true`);
        console.log(`✅ Cleaned up failed VM ${vmid}`);
      } catch (cleanupError) {
        console.warn(`⚠️  Could not cleanup VM ${vmid}:`, cleanupError);
      }

      throw error;
    }
  }

  /**
   * Clone a template to create a new VM
   */
  private static async cloneTemplate(
    templateId: number,
    vmid: number,
    name: string
  ): Promise<void> {
    console.log(`📋 Cloning template ${templateId} to VM ${vmid}...`);
    await runCommand(`qm clone ${templateId} ${vmid} --name "${name}" --full`);
    console.log(`✅ Template cloned successfully`);
  }

  /**
   * Configure VM hardware settings including CPU, memory, disk, and network
   */
  private static async configureVM(
    vmid: number,
    config: any,
    proxmoxConfig: any
  ): Promise<void> {
    console.log(`⚙️  Configuring VM ${vmid}...`);

    await runCommand(
      `qm set ${vmid} --cores ${config.cores} --memory ${config.memory}`
    );
    console.log(`💾 Set cores: ${config.cores}, memory: ${config.memory}MB`);

    let netConfig = `${config.network.model},bridge=${config.network.bridge}`;

    if (config.network.vlan && config.network.vlan !== 1) {
      netConfig += `,tag=${config.network.vlan}`;
    }

    if (config.network.speed && config.network.speed !== "1000") {
      netConfig += `,rate=${config.network.speed}`;
    }

    console.log(`🌐 Setting network configuration: ${netConfig}`);
    await runCommand(`qm set ${vmid} --net0 ${netConfig}`);

    if (config.diskSize && config.diskSize !== "20G") {
      console.log(`💿 Resizing disk to ${config.diskSize}...`);
      await runCommand(`qm resize ${vmid} scsi0 ${config.diskSize}`);
    }

    console.log(`✅ VM hardware configuration completed`);
  }

  /**
   * Setup cloud-init configuration for the VM
   */
  private static async setupCloudInit(
    vmid: number,
    config: any,
    proxmoxConfig: any
  ): Promise<void> {
    console.log(`☁️  Setting up cloud-init for VM ${vmid}...`);

    await runCommand(`qm set ${vmid} --ciuser "${config.username}"`);
    console.log(`👤 Set cloud-init user: ${config.username}`);

    await runCommand(`qm set ${vmid} --cipassword '${config.password}'`);
    console.log(`🔐 Set cloud-init password`);

    await runCommand(`qm set ${vmid} --name "${config.hostname}"`);
    console.log(`🏷️  Set hostname: ${config.hostname}`);

    if (config.sshKey) {
      await runCommand(`qm set ${vmid} --sshkeys '${config.sshKey}'`);
      console.log(`🔑 Set SSH public key`);
    }

    // Decided to end up doing this in the vm templates that are being cloned.

    //const storage = configManager.getTemplateStorage(config.os);
    //await runCommand(`qm set ${vmid} --ide2 ${storage}:cloudinit`);
    //console.log(`💾 Set cloud-init storage: ${storage}`);

    //await runCommand(`qm set ${vmid} --boot c --bootdisk scsi0`);
    //console.log(`🥾 Set boot configuration`);

    console.log(`✅ Cloud-init setup completed`);
  }

  /**
   * Start the VM
   */
  private static async startVM(vmid: number): Promise<void> {
    console.log(`🚀 Starting VM ${vmid}...`);
    await runCommand(`qm start ${vmid}`);
    console.log(`✅ VM ${vmid} started successfully`);

    // Update database status
    try {
      await DatabaseService.updateVMStatus(vmid, "running");
    } catch (dbError) {
      console.warn(
        `⚠️  Failed to update VM ${vmid} status in database:`,
        dbError
      );
    }
  }

  /**
   * Get the current status of a VM
   */
  public static async getVMStatus(vmid: number): Promise<string> {
    try {
      const output = await runCommand(`qm status ${vmid}`);
      const status = output.split(" ")[1] || "unknown";
      console.log(`📊 VM ${vmid} status: ${status}`);
      return status;
    } catch (error) {
      console.log(`❓ VM ${vmid} not found`);
      return "not_found";
    }
  }

  /**
   * List all VMs on the Proxmox host
   */
  public static async listVMs(): Promise<any[]> {
    try {
      console.log(`📋 Listing all VMs...`);
      const output = await runCommand("qm list");
      const lines = output.split("\n").slice(1);

      const vms = lines
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 6) {
            return {
              vmid: parts[0],
              name: parts[1],
              status: parts[2],
              memory: parts[3],
              bootdisk: parts[4],
              pid: parts[5],
            };
          }
          return null;
        })
        .filter((vm) => vm && vm.vmid);

      console.log(`📊 Found ${vms.length} VMs`);
      return vms;
    } catch (error) {
      console.error("❌ Failed to list VMs:", error);
      return [];
    }
  }

  /**
   * Stop a VM
   */
  public static async stopVM(vmid: number): Promise<void> {
    console.log(`⏹️  Stopping VM ${vmid}...`);
    await runCommand(`qm stop ${vmid}`);
    console.log(`✅ VM ${vmid} stopped`);

    // Update database status
    try {
      await DatabaseService.updateVMStatus(vmid, "stopped");
    } catch (dbError) {
      console.warn(
        `⚠️  Failed to update VM ${vmid} status in database:`,
        dbError
      );
    }
  }

  /**
   * Start a VM
   */
  public static async startVMById(vmid: number): Promise<void> {
    console.log(`▶️  Starting VM ${vmid}...`);
    await runCommand(`qm start ${vmid}`);
    console.log(`✅ VM ${vmid} started`);

    // Update database status
    try {
      await DatabaseService.updateVMStatus(vmid, "running");
    } catch (dbError) {
      console.warn(
        `⚠️  Failed to update VM ${vmid} status in database:`,
        dbError
      );
    }
  }

  /**
   * Restart a VM
   */
  public static async restartVM(vmid: number): Promise<void> {
    console.log(`🔄 Restarting VM ${vmid}...`);
    await runCommand(`qm restart ${vmid}`);
    console.log(`✅ VM ${vmid} restarted`);

    // Update database status
    try {
      await DatabaseService.updateVMStatus(vmid, "running");
    } catch (dbError) {
      console.warn(
        `⚠️  Failed to update VM ${vmid} status in database:`,
        dbError
      );
    }
  }

  /**
   * Reset a VM (hard reset)
   */
  public static async resetVM(vmid: number): Promise<void> {
    console.log(`🔌 Resetting VM ${vmid}...`);
    await runCommand(`qm reset ${vmid}`);
    console.log(`✅ VM ${vmid} reset`);
  }

  /**
   * Delete a VM permanently
   */
  public static async deleteVM(vmid: number): Promise<void> {
    console.log(`🗑️  Deleting VM ${vmid}...`);

    try {
      await runCommand(`qm stop ${vmid} || true`);
      console.log(`⏹️  VM ${vmid} stopped`);
    } catch (error) {
      console.log(`⚠️  VM ${vmid} was not running or already stopped`);
    }

    await runCommand(`qm destroy ${vmid} --skiplock`);
    console.log(`✅ VM ${vmid} deleted successfully`);
  }

  /**
   * Get detailed VM configuration
   */
  public static async getVMConfig(vmid: number): Promise<any> {
    try {
      console.log(`📋 Getting configuration for VM ${vmid}...`);
      const output = await runCommand(`qm config ${vmid}`);

      const config: any = {};
      const lines = output.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && trimmed.includes(":")) {
          const [key, ...valueParts] = trimmed.split(":");
          const value = valueParts.join(":").trim();
          config[key.trim()] = value;
        }
      }

      console.log(`✅ Retrieved configuration for VM ${vmid}`);
      return config;
    } catch (error) {
      console.error(`❌ Failed to get configuration for VM ${vmid}:`, error);
      throw error;
    }
  }

  /**
   * Get VM resource usage (CPU, memory, disk, network)
   */
  public static async getVMStats(vmid: number): Promise<any> {
    try {
      console.log(`📊 Getting stats for VM ${vmid}...`);

      const status = await this.getVMStatus(vmid);

      if (status === "not_found") {
        throw new Error(`VM ${vmid} not found`);
      }

      const stats = {
        vmid,
        status,
        timestamp: new Date().toISOString(),
      };

      console.log(`✅ Retrieved stats for VM ${vmid}`);
      return stats;
    } catch (error) {
      console.error(`❌ Failed to get stats for VM ${vmid}:`, error);
      throw error;
    }
  }
}
