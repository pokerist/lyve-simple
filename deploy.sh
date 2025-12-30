#!/bin/bash

# HikCentral Middleware Deployment Script for Ubuntu
# Usage: ./deploy.sh [install|update|uninstall]

set -e

# Configuration
APP_NAME="hikcentral-middleware"
APP_DIR="/opt/hikcentral-middleware"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
LOG_DIR="/var/log/${APP_NAME}"
USER="nodejs"
GROUP="nodejs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root for security reasons."
        error "Please run as a regular user with sudo privileges."
        exit 1
    fi
}

install_dependencies() {
    log "Installing system dependencies..."
    
    # Update package list
    sudo apt update
    
    # Install Node.js 18.x
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Install other dependencies
    sudo apt-get install -y build-essential
    
    log "Node.js version: $(node --version)"
    log "npm version: $(npm --version)"
}

create_user() {
    log "Creating application user..."
    
    if ! id "$USER" &>/dev/null; then
        sudo useradd -r -s /bin/false -d "$APP_DIR" "$USER"
        log "Created user: $USER"
    else
        log "User $USER already exists"
    fi
}

setup_directories() {
    log "Setting up directories..."
    
    # Create application directory
    sudo mkdir -p "$APP_DIR"
    sudo mkdir -p "$LOG_DIR"
    
    # Set ownership
    sudo chown -R "$USER:$GROUP" "$APP_DIR"
    sudo chown -R "$USER:$GROUP" "$LOG_DIR"
    
    # Set permissions
    sudo chmod 755 "$APP_DIR"
    sudo chmod 755 "$LOG_DIR"
}

install_application() {
    log "Installing application..."
    
    # Copy application files
    sudo cp -r ./* "$APP_DIR/"
    sudo chown -R "$USER:$GROUP" "$APP_DIR"
    
    # Install npm dependencies
    sudo -u "$USER" npm install --production
    
    log "Application installed to $APP_DIR"
}

setup_service() {
    log "Setting up systemd service..."
    
    # Copy service file
    sudo cp "$APP_DIR/hikcentral-middleware.service" "$SERVICE_FILE"
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    # Enable service
    sudo systemctl enable "$APP_NAME"
    
    log "Service configured and enabled"
}

start_service() {
    log "Starting service..."
    
    sudo systemctl start "$APP_NAME"
    
    # Check if service is running
    if sudo systemctl is-active --quiet "$APP_NAME"; then
        log "Service started successfully"
    else
        error "Failed to start service"
        sudo systemctl status "$APP_NAME"
        exit 1
    fi
}

install_firewall() {
    log "Configuring firewall..."
    
    # Install UFW if not present
    if ! command -v ufw &> /dev/null; then
        sudo apt install -y ufw
    fi
    
    # Allow SSH (important for remote servers)
    sudo ufw allow ssh
    
    # Allow port 3000
    sudo ufw allow 3000
    
    # Enable firewall
    sudo ufw --force enable
    
    log "Firewall configured"
}

show_status() {
    log "Application Status:"
    echo "=================================="
    echo "Application Directory: $APP_DIR"
    echo "Service Name: $APP_NAME"
    echo "Port: 3000"
    echo "User: $USER"
    echo "Log Directory: $LOG_DIR"
    echo ""
    
    if sudo systemctl is-active --quiet "$APP_NAME"; then
        echo "Service Status: RUNNING"
    else
        echo "Service Status: STOPPED"
    fi
    
    echo ""
    echo "Useful commands:"
    echo "  sudo systemctl status $APP_NAME    # Check service status"
    echo "  sudo systemctl restart $APP_NAME   # Restart service"
    echo "  sudo journalctl -u $APP_NAME -f    # View logs"
    echo "  curl http://localhost:3000         # Test connection"
    echo "=================================="
}

install() {
    log "Starting installation..."
    
    check_root
    install_dependencies
    create_user
    setup_directories
    install_application
    setup_service
    install_firewall
    start_service
    show_status
    
    log "Installation completed successfully!"
}

update() {
    log "Starting update..."
    
    check_root
    
    # Stop service
    sudo systemctl stop "$APP_NAME"
    
    # Backup current version
    sudo cp -r "$APP_DIR" "${APP_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Update application
    sudo cp -r ./* "$APP_DIR/"
    sudo chown -R "$USER:$GROUP" "$APP_DIR"
    
    # Install new dependencies if any
    cd "$APP_DIR"
    sudo -u "$USER" npm install
    
    # Restart service
    sudo systemctl start "$APP_NAME"
    
    # Check status
    if sudo systemctl is-active --quiet "$APP_NAME"; then
        log "Update completed successfully"
        show_status
    else
        error "Update failed, service not running"
        sudo systemctl status "$APP_NAME"
        exit 1
    fi
}

uninstall() {
    log "Starting uninstallation..."
    
    check_root
    
    # Stop and disable service
    sudo systemctl stop "$APP_NAME"
    sudo systemctl disable "$APP_NAME"
    
    # Remove service file
    sudo rm -f "$SERVICE_FILE"
    sudo systemctl daemon-reload
    
    # Remove application directory
    sudo rm -rf "$APP_DIR"
    
    # Remove log directory
    sudo rm -rf "$LOG_DIR"
    
    # Remove user (optional, comment out if you want to keep the user)
    # sudo userdel "$USER"
    
    log "Uninstallation completed"
}

show_help() {
    echo "HikCentral Middleware Deployment Script"
    echo ""
    echo "Usage: $0 [install|update|uninstall]"
    echo ""
    echo "Commands:"
    echo "  install     Install the application"
    echo "  update      Update the application"
    echo "  uninstall   Uninstall the application"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh install"
    echo "  ./deploy.sh update"
    echo "  ./deploy.sh uninstall"
}

# Main execution
case "${1:-}" in
    install)
        install
        ;;
    update)
        update
        ;;
    uninstall)
        uninstall
        ;;
    *)
        show_help
        exit 1
        ;;
esac
