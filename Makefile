# Prompt Tracker - launchctl service management
# Usage: make install|uninstall|status|restart|logs

# Variables
PLIST_NAME = com.prompttracker.plist
PLIST_SRC = $(CURDIR)/$(PLIST_NAME)
PLIST_DST = $(HOME)/Library/LaunchAgents/$(PLIST_NAME)
SERVICE_LABEL = com.prompttracker
LOG_FILE = $(HOME)/Library/Logs/prompt-tracker.log
ERROR_LOG_FILE = $(HOME)/Library/Logs/prompt-tracker.error.log

.PHONY: help install uninstall status restart logs clean check

help:
	@echo "Prompt Tracker Service Management"
	@echo ""
	@echo "Available commands:"
	@echo "  make install    - Install and start the launchctl service"
	@echo "  make uninstall  - Stop and remove the launchctl service"
	@echo "  make status     - Check if the service is running"
	@echo "  make restart    - Restart the service"
	@echo "  make logs       - Show service logs"
	@echo "  make clean      - Remove log files"
	@echo "  make check      - Check service configuration"

check:
	@echo "Checking configuration..."
	@if [ ! -f "$(PLIST_SRC)" ]; then \
		echo "❌ Error: $(PLIST_SRC) not found"; \
		exit 1; \
	fi
	@if [ ! -x "./prompt-tracker" ]; then \
		echo "❌ Error: prompt-tracker is not executable"; \
		echo "   Run: chmod +x ./prompt-tracker"; \
		exit 1; \
	fi
	@echo "✓ Configuration OK"

install: check
	@echo "Installing Prompt Tracker service..."
	@mkdir -p $(HOME)/Library/LaunchAgents
	@mkdir -p $(HOME)/Library/Logs
	@cp $(PLIST_SRC) $(PLIST_DST)
	@echo "✓ Copied plist to ~/Library/LaunchAgents/"
	@launchctl load $(PLIST_DST)
	@echo "✓ Service loaded and started"
	@sleep 2
	@$(MAKE) status

uninstall:
	@echo "Uninstalling Prompt Tracker service..."
	@if [ -f "$(PLIST_DST)" ]; then \
		launchctl unload $(PLIST_DST) 2>/dev/null || true; \
		rm $(PLIST_DST); \
		echo "✓ Service stopped and removed"; \
	else \
		echo "Service not installed"; \
	fi

status:
	@echo "Checking Prompt Tracker service status..."
	@if launchctl list | grep -q "$(SERVICE_LABEL)"; then \
		echo "✓ Service is RUNNING"; \
		echo ""; \
		launchctl list | grep "$(SERVICE_LABEL)" | awk '{print "  PID: " $$1 "\n  Status: " $$2 "\n  Label: " $$3}'; \
		echo ""; \
		echo "Web interface: http://127.0.0.1:8080"; \
	else \
		echo "✗ Service is NOT RUNNING"; \
	fi

restart: uninstall install
	@echo "✓ Service restarted"

logs:
	@echo "=== Standard Output Log ==="
	@if [ -f "$(LOG_FILE)" ]; then \
		tail -n 50 $(LOG_FILE); \
	else \
		echo "No log file found at $(LOG_FILE)"; \
	fi
	@echo ""
	@echo "=== Error Log ==="
	@if [ -f "$(ERROR_LOG_FILE)" ]; then \
		tail -n 50 $(ERROR_LOG_FILE); \
	else \
		echo "No error log file found at $(ERROR_LOG_FILE)"; \
	fi

clean:
	@echo "Cleaning log files..."
	@rm -f $(LOG_FILE) $(ERROR_LOG_FILE)
	@echo "✓ Log files removed"
