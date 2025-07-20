# Proxmox VM Provisioning Daemon

A high-performance Proxmox VE virtual machine provisioning daemon built with TypeScript and Bun. This daemon provides a REST API for automated VM provisioning, management, and monitoring in Proxmox VE environments.

## 🚀 Features

- **Automated VM Provisioning**: Create VMs from predefined templates with customizable configurations
- **Smart VM ID Management**: Automatic VM ID allocation with conflict resolution and caching
- **REST API**: Full-featured HTTP API for VM lifecycle management
- **Template System**: Flexible template-based VM configuration with YAML support
- **Database Integration**: MongoDB integration for VM record tracking and management
- **Health Monitoring**: Built-in health checks and system monitoring
- **Cache Management**: Intelligent VM ID caching for improved performance
- **Validation**: Comprehensive input validation with Zod schema validation
- **Authentication**: Secure API token-based authentication
- **Cloud-init Support**: Automated VM configuration with cloud-init
- **Network Configuration**: VLAN and network bridge management
- **Binary Distribution**: Standalone binary with embedded configurations

## 📋 Prerequisites

- **Proxmox VE** 7.0 or higher
- **Bun** runtime (for development) or standalone binary
- **MongoDB** (optional, for VM record persistence)
- **Root/sudo access** on Proxmox node
- **qm command** available (Proxmox VE tools)

## 🛠️ Installation

### Quick Setup (Binary - Recommended)

The fastest way to get started is by using the pre-built binary:

```bash
# Clone the repository
git clone https://github.com/Team-Tritan/PVE-Provisioning-Daemon
cd PVE-Provisioning-Daemon

# Install dependencies
bun install

# Embed configs and build binary
bun run build:binary

# Create complete distribution package
bun run package:binary
```

This creates a standalone binary in `dist/` with embedded configurations.

### Development Setup

```bash
# Install dependencies
bun install

# Run in development mode with hot reload
bun run dev

# Build TypeScript for production
bun run build

# Generate API tokens
bun run generate-token

# Test API endpoints
bun run test-api
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on [`.env.example`](.env.example):

```env
# Server Configuration
LOG_LEVEL=info
LOG_COMMANDS=false
PORT=4000
HOST=0.0.0.0

# Database Configuration (Optional)
MONGODB_URI=mongodb://localhost:27017/proxmox-daemon

# API Security (Required)
API_TOKEN=your-secure-api-token-here
# Optional: Multiple tokens separated by commas
# API_TOKENS=token1,token2,token3

# Development/Production Environment
NODE_ENV=production
```

### Template Configuration

Configure VM templates in [`config/templates.yaml`](config/templates.yaml):

```yaml
templates:
  debian12:
    id: 9000
    name: "Debian 12"
    description: "Debian 12 Bookworm CloudInit"
    arch: "amd64"
    default_user: "vmuser"
    storage: "pve-a"

defaults:
  cores: 2
  memory: 2048
  disk_size: "10G"
  storage: "pve-a"
  network:
    bridge: "vmbr0"
    model: "virtio"
    vlan: 3604
    speed: 125
```

### Configuration Management

The daemon supports both file-based and embedded configurations:

- **Development**: Uses files from `config/` directory
- **Binary Mode**: Uses embedded configurations from [`src/config/embeddedConfigs.ts`](src/config/embeddedConfigs.ts)
- **Extract Configs**: Use `bun scripts/extract-configs.ts` to extract embedded configs to files

## 🚀 Usage

### Starting the Daemon

#### Binary Mode (Production)
```bash
# Using the standalone binary
./dist/proxmox-daemon

# Or from distribution package
cd dist/
./proxmox-daemon
```

#### Development Mode
```bash
# Hot reload development server
bun run dev

# Build and run
bun run build && bun run start
```

### Generate API Tokens

```bash
# Generate a 32-character token
bun run generate-token

# Generate custom length token
bun scripts/generate-token.ts 64
```

## 📡 API Reference

All endpoints require authentication via `Authorization: Bearer <token>` or `x-api-key: <token>` header.

### VM Provisioning

#### Create VM
```http
POST /provision-vm
Content-Type: application/json
Authorization: Bearer your-api-token

{
  "subscriptionId": "sub_123456",
  "custEmail": "customer@example.com",
  "os": "debian12",
  "name": "my-test-vm",
  "hostname": "test-vm.local",
  "cores": 4,
  "memory": 4096,
  "diskSize": "50G",
  "username": "admin",
  "password": "SecurePassword123!",
  "sshKey": "ssh-rsa AAAAB3NzaC1yc2E...",
  "network": {
    "vlan": 100,
    "speed": "1000"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "vmid": 1001,
    "status": "running",
    "message": "VM 1001 has been successfully provisioned and started",
    "config": {
      "os": "debian12",
      "name": "my-test-vm",
      "cores": 4,
      "memory": 4096,
      "hostname": "test-vm.local",
      "username": "admin",
      "network": {
        "bridge": "vmbr0",
        "vlan": 100,
        "speed": "1000"
      }
    }
  },
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

### VM Management

#### Get VM Status
```http
GET /vm/{vmid}/status
Authorization: Bearer your-api-token
```

#### Get All VMs
```http
GET /vms
Authorization: Bearer your-api-token
```

#### Get VMs by Subscription
```http
GET /vms/subscription/{subscriptionId}
Authorization: Bearer your-api-token
```

#### Get VMs by Customer
```http
GET /vms/customer/{custEmail}
Authorization: Bearer your-api-token
```

#### Get VM Database Record
```http
GET /vm/{vmid}/record
Authorization: Bearer your-api-token
```

#### Get All VM Records (Paginated)
```http
GET /vms/all?page=1&limit=50&status=running
Authorization: Bearer your-api-token
```

### System Monitoring

#### Health Check (No Auth Required)
```http
GET /healthcheck
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2024-01-20T10:30:00.000Z",
    "uptime": 3600,
    "version": "1.0.0",
    "proxmox_connected": true,
    "response_time_ms": 45.32
  }
}
```

#### Get Available Templates
```http
GET /templates
Authorization: Bearer your-api-token
```

## 🔧 Advanced Features

### VM ID Management

The [`VMIdManager`](src/utils/helpers.ts) automatically manages VM IDs with these features:

- **Starting ID**: 1001 (configurable)
- **Conflict Resolution**: Automatically finds next available ID
- **Multiple Discovery Methods**:
  1. Cluster resources via `pvesh get /cluster/resources`
  2. Local VM list via `qm list`
  3. Filesystem scan of `/etc/pve/nodes/{node}/qemu-server/`
- **Caching**: 30-second TTL cache for performance
- **Persistence**: VM ID state saved to `/tmp/proxmox-daemon-vmid`

### Database Integration

The daemon uses MongoDB for persistent VM record storage via [`DatabaseService`](src/services/databaseService.ts):

```typescript
// VM records include
interface IVMRecord {
  vmid: number;
  subscriptionId: string;
  custEmail: string;
  name: string;
  hostname: string;
  os: string;
  cores: number;
  memory: number;
  diskSize: string;
  status: "created" | "starting" | "running" | "stopped" | "error";
  network: {
    bridge: string;
    vlan: number;
    speed: string;
  };
  dateProvisioned: Date;
  dateUpdated: Date;
  config: {
    username: string;
    template: string;
    storage: string;
  };
}
```

### Shell Command Execution

The [`ShellExecutor`](src/utils/shell.ts) provides safe command execution with:

- **Logging**: Optional command logging via `LOG_COMMANDS=true`
- **Error Handling**: Comprehensive error reporting
- **Connection Validation**: Proxmox connectivity checks
- **Command Results**: Detailed output including exit codes

### Input Validation

All API inputs are validated using Zod schemas in [`src/types/api.ts`](src/types/api.ts):

- **Provision Options**: VM configuration validation
- **VM ID Parameters**: Numeric VM ID validation
- **Email Validation**: Customer email format validation
- **Hostname Validation**: RFC-compliant hostname checking
- **Network Validation**: VLAN and speed validation

## 🛠️ Scripts and Utilities

### Available Scripts

```bash
# Development
bun run dev                    # Hot reload development server
bun run build                  # Build TypeScript
bun run start                  # Start built application

# Binary Building
bun run build:binary           # Create standalone binary
bun run build:binary-linux     # Create Linux x64 binary
bun run package:binary         # Create complete distribution

# Configuration Management
bun run embed-configs          # Embed configs into TypeScript
bun run extract-configs        # Extract embedded configs to files

# Utilities
bun run generate-token         # Generate secure API token
bun run test-api               # Test API endpoints
bun run clean                  # Clean build artifacts
```

### Testing API Endpoints

Use the built-in test script:

```bash
# Test local server
bun run test-api

# Test remote server
bun scripts/test-api.ts https://your-server.com your-api-token
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Permission Denied
```bash
# Ensure binary has execute permissions
chmod +x ./dist/proxmox-daemon

# Ensure user has Proxmox access
sudo usermod -a -G root your-user
```

#### 2. VM ID Conflicts
The daemon handles this automatically, but you can force cache refresh:
```bash
# Check VM cache stats
curl -H "Authorization: Bearer $API_TOKEN" \
  http://localhost:4000/healthcheck
```

#### 3. Template Not Found
```bash
# List available templates
curl -H "Authorization: Bearer $API_TOKEN" \
  http://localhost:4000/templates

# Check template configuration
cat config/templates.yaml
```

#### 4. Database Connection Issues
```bash
# Check MongoDB status
systemctl status mongod

# Test connection
mongo mongodb://localhost:27017/proxmox-daemon
```

#### 5. Proxmox Connection Issues
```bash
# Test qm command
qm list

# Check Proxmox node status
pvesh get /nodes
```

### Debug Logging

Enable detailed logging:

```env
LOG_LEVEL=debug
LOG_COMMANDS=true
```

View logs with formatting:
```bash
# Development
bun run dev 2>&1 | tee daemon.log

# Production binary
./proxmox-daemon 2>&1 | tee daemon.log
```

## 🔒 Security Best Practices

### API Security
- Use strong API tokens (32+ characters)
- Implement rate limiting via reverse proxy
- Use HTTPS in production
- Restrict API access by IP if possible

### System Security
- Run daemon with minimal required privileges
- Use dedicated user account (not root) when possible
- Implement proper firewall rules
- Monitor daemon logs for suspicious activity

### Network Security
- Isolate management network
- Use VLANs for VM networks
- Implement proper network segmentation
- Monitor network traffic

## 📊 Performance and Monitoring

### Performance Metrics
- **VM Creation Time**: 30-90 seconds (depends on template size and storage)
- **API Response Time**: <100ms for status endpoints
- **Cache Refresh Time**: 1-3 seconds for 100+ VMs
- **Memory Usage**: ~50MB base + cache overhead
- **Database Operations**: <50ms for typical queries

### Monitoring Endpoints

#### System Health
```bash
curl http://localhost:4000/healthcheck
```

#### VM Statistics
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/vms/all?page=1&limit=10"
```

## 🔄 Production Deployment

### Systemd Service

Create `/etc/systemd/system/proxmox-daemon.service`:

```ini
[Unit]
Description=Proxmox VM Provisioning Daemon
After=network.target mongod.service
Wants=mongod.service

[Service]
Type=simple
User=proxmox-daemon
Group=proxmox-daemon
WorkingDirectory=/opt/proxmox-daemon
ExecStart=/opt/proxmox-daemon/proxmox-daemon
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/proxmox-daemon /tmp

[Install]
WantedBy=multi-user.target
```

Setup and deployment:
```bash
# Create user
sudo useradd -r -s /bin/false proxmox-daemon

# Install daemon
sudo mkdir -p /opt/proxmox-daemon
sudo cp dist/* /opt/proxmox-daemon/
sudo chown -R proxmox-daemon:proxmox-daemon /opt/proxmox-daemon
sudo chmod +x /opt/proxmox-daemon/proxmox-daemon

# Install and start service
sudo systemctl enable proxmox-daemon
sudo systemctl start proxmox-daemon
sudo systemctl status proxmox-daemon
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name proxmox-api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Rate limiting
        limit_req zone=api burst=10 nodelay;
    }
}
```

## 🧪 Development Guide

### Project Structure
```
src/
├── config/
│   ├── configManager.ts     # Configuration management
│   └── embeddedConfigs.ts   # Embedded configurations
├── middleware/
│   └── auth.ts              # Authentication middleware
├── models/
│   └── vmRecord.ts          # MongoDB VM record model
├── services/
│   ├── databaseService.ts   # Database operations
│   └── vmProvisioningService.ts # VM provisioning logic
├── types/
│   └── api.ts               # TypeScript type definitions
├── utils/
│   ├── helpers.ts           # Utility functions and VM ID management
│   └── shell.ts             # Shell command execution
├── index.ts                 # Main application entry point
└── routes.ts                # API route definitions
```

### Key Components

#### Configuration Management
- [`configManager`](src/config/configManager.ts): Handles YAML template loading and environment configuration
- [`embeddedConfigs`](src/config/embeddedConfigs.ts): Provides embedded configurations for binary mode

#### VM Management
- [`VMProvisioningService`](src/services/vmProvisioningService.ts): Core VM lifecycle management
- [`VMIdManager`](src/utils/helpers.ts): Smart VM ID allocation and caching
- [`ShellExecutor`](src/utils/shell.ts): Safe Proxmox command execution

#### Data Layer
- [`DatabaseService`](src/services/databaseService.ts): MongoDB integration for VM records
- [`VMRecord`](src/models/vmRecord.ts): Mongoose model for VM data

#### API Layer
- [`routes`](src/routes.ts): Fastify route definitions
- [`authenticateToken`](src/middleware/auth.ts): API authentication middleware
- [`api.ts`](src/types/api.ts): Zod validation schemas

### Adding New Features

#### 1. Add New VM Template
```yaml
# In config/templates.yaml
templates:
  ubuntu22:
    id: 9001
    name: "Ubuntu 22.04"
    description: "Ubuntu 22.04 LTS CloudInit"
    arch: "amd64"
    default_user: "ubuntu"
    storage: "local-lvm"
```

#### 2. Add New API Endpoint
```typescript
// In src/routes.ts
fastify.get("/vm/:vmid/config", async (request, reply) => {
  const { vmid } = request.params as { vmid: string };
  const config = await VMProvisioningService.getVMConfig(parseInt(vmid));
  
  return {
    success: true,
    data: config,
    timestamp: formatTimestamp(),
  };
});
```

#### 3. Add New Validation Schema
```typescript
// In src/types/api.ts
export const VMConfigSchema = z.object({
  cores: z.number().min(1).max(64),
  memory: z.number().min(512).max(131072),
  // ... additional fields
});
```

### Testing

```bash
# Run development server
bun run dev

# Test specific endpoint
curl -H "Authorization: Bearer $API_TOKEN" \
  http://localhost:4000/templates

# Test VM provisioning
curl -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId":"test","custEmail":"test@example.com","os":"debian12","name":"test-vm","hostname":"test.local","password":"SecurePass123!"}' \
  http://localhost:4000/provision-vm
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Workflow

```bash
# Setup development environment
git clone <repo>
cd Daemon-Provisioner
bun install

# Make changes
# ... edit files ...

# Test changes
bun run dev
bun run test-api

# Build and test binary
bun run build:binary
./dist/proxmox-daemon
```

## 📞 Support

- **Issues**: [GitHub Issues]
- **Documentation**: This README and inline code documentation
- **Security Issues**: Please report privately

---

**Built with ❤️ by Tritan Internet**