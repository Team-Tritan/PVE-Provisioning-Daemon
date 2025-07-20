import { exec } from "child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class ShellExecutor {
  private static logCommands = process.env.LOG_COMMANDS === "true";

  public static async runCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.logCommands) {
        console.log(`📝 Executing: ${cmd}`);
      }

      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          const errorMessage = `❌ Command failed: ${cmd}\nExit code: ${err.code}\nStderr: ${stderr}`;
          console.error(errorMessage);
          return reject(new Error(errorMessage));
        }

        if (this.logCommands && stdout) {
          console.log(`✅ Command output: ${stdout.trim()}`);
        }

        resolve(stdout.trim());
      });
    });
  }

  public static async runCommandWithDetails(
    cmd: string
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      if (this.logCommands) {
        console.log(`📝 Executing: ${cmd}`);
      }

      exec(cmd, (err, stdout, stderr) => {
        const result: CommandResult = {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: err ? err.code || 1 : 0,
        };

        if (this.logCommands) {
          console.log(`Command result:`, result);
        }

        resolve(result);
      });
    });
  }

  public static async validateProxmoxConnection(): Promise<boolean> {
    try {
      await this.runCommand("qm list");
      return true;
    } catch (error) {
      console.error("❌ Proxmox connection validation failed:", error);
      return false;
    }
  }
}

export const runCommand = ShellExecutor.runCommand.bind(ShellExecutor);
