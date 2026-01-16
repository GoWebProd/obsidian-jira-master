# Makefile for Obsidian Jira Issue Plugin
# Mirrors GitHub Actions release workflow for local development

PLUGIN_NAME := obsidian-jira-master
BUILD_DIR := $(PLUGIN_NAME)
ARTIFACTS := main.js manifest.json styles.css
VAULT_PATH ?= $(HOME)/Documents/Obsidian

# Color output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: help release clean version install dev test build check-pnpm check-build

help: ## Display available targets
	@echo "$(BLUE)Obsidian Jira Issue Plugin - Makefile$(NC)"
	@echo ""
	@echo "$(GREEN)Available targets:$(NC)"
	@echo "  $(YELLOW)make release$(NC)       - Build release archive (mirrors GitHub Actions)"
	@echo "  $(YELLOW)make install$(NC)       - Install plugin to Obsidian vault"
	@echo "  $(YELLOW)make clean$(NC)         - Remove build artifacts"
	@echo "  $(YELLOW)make version$(NC)       - Bump version interactively"
	@echo "  $(YELLOW)make build$(NC)         - Run production build"
	@echo "  $(YELLOW)make dev$(NC)           - Run watch mode for development"
	@echo "  $(YELLOW)make test$(NC)          - Run tests"
	@echo "  $(YELLOW)make help$(NC)          - Display this help message"
	@echo ""
	@echo "$(GREEN)Environment variables:$(NC)"
	@echo "  $(YELLOW)VAULT_PATH$(NC)         - Path to Obsidian vault (default: $(VAULT_PATH))"
	@echo ""
	@echo "$(GREEN)Examples:$(NC)"
	@echo "  make release"
	@echo "  VAULT_PATH=~/my-vault make install"
	@echo "  make clean && make release"

check-pnpm:
	@command -v pnpm >/dev/null 2>&1 || { \
		echo "$(RED)Error: pnpm is not installed$(NC)" >&2; \
		echo "Install it with: npm install -g pnpm" >&2; \
		exit 1; \
	}

check-build:
	@if [ ! -f "main.js" ] || [ ! -f "manifest.json" ] || [ ! -f "styles.css" ]; then \
		echo "$(RED)Error: Build artifacts not found$(NC)" >&2; \
		echo "Run 'make build' or 'make release' first" >&2; \
		exit 1; \
	fi

release: check-pnpm ## Build release archive (mirrors GitHub Actions workflow)
	@echo "$(BLUE)Building release for $(PLUGIN_NAME)...$(NC)"
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	pnpm install --frozen-lockfile
	@echo "$(YELLOW)Running production build...$(NC)"
	pnpm run build
	@echo "$(YELLOW)Creating release directory...$(NC)"
	mkdir -p $(BUILD_DIR)
	@echo "$(YELLOW)Copying artifacts...$(NC)"
	cp $(ARTIFACTS) $(BUILD_DIR)/
	@echo "$(YELLOW)Creating zip archive...$(NC)"
	zip -r $(PLUGIN_NAME).zip $(BUILD_DIR)
	@echo "$(GREEN)✓ Release build complete!$(NC)"
	@echo "$(GREEN)Archive created: $(PLUGIN_NAME).zip$(NC)"
	@echo ""
	@echo "Contents:"
	@unzip -l $(PLUGIN_NAME).zip

clean: ## Remove build artifacts
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	rm -rf $(BUILD_DIR)
	rm -f $(PLUGIN_NAME).zip
	rm -f main.js
	@echo "$(GREEN)✓ Clean complete$(NC)"

version: check-pnpm ## Bump version interactively
	@echo "$(BLUE)Version Bump$(NC)"
	@echo "Current version: $$(node -p "require('./package.json').version")"
	@read -p "Enter new version (e.g., 1.59.0): " version; \
	if [ -z "$$version" ]; then \
		echo "$(RED)Error: Version cannot be empty$(NC)" >&2; \
		exit 1; \
	fi; \
	echo "$(YELLOW)Updating version to $$version...$(NC)"; \
	pnpm run version $$version; \
	echo "$(GREEN)✓ Version updated to $$version$(NC)"; \
	echo ""; \
	echo "Updated files:"; \
	echo "  - package.json"; \
	echo "  - manifest.json"; \
	echo "  - versions.json"; \
	echo ""; \
	echo "Review changes with: git diff"

build: check-pnpm ## Run production build
	@echo "$(YELLOW)Running production build...$(NC)"
	pnpm run build
	@echo "$(GREEN)✓ Build complete$(NC)"

dev: check-pnpm ## Run watch mode for development
	@echo "$(BLUE)Starting development watch mode...$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to stop$(NC)"
	pnpm run dev

test: check-pnpm ## Run tests
	@echo "$(YELLOW)Running tests...$(NC)"
	pnpm run test

install: check-build ## Install plugin to Obsidian vault
	@if [ ! -d "$(VAULT_PATH)" ]; then \
		echo "$(RED)Error: Vault not found at $(VAULT_PATH)$(NC)" >&2; \
		echo "Set VAULT_PATH environment variable to your vault location:" >&2; \
		echo "  VAULT_PATH=~/path/to/vault make install" >&2; \
		exit 1; \
	fi
	@echo "$(BLUE)Installing plugin to Obsidian vault...$(NC)"
	@echo "$(YELLOW)Vault: $(VAULT_PATH)$(NC)"
	@mkdir -p "$(VAULT_PATH)/.obsidian/plugins/$(PLUGIN_NAME)"
	@cp $(ARTIFACTS) "$(VAULT_PATH)/.obsidian/plugins/$(PLUGIN_NAME)/"
	@echo "$(GREEN)✓ Plugin installed successfully!$(NC)"
	@echo "$(GREEN)Location: $(VAULT_PATH)/.obsidian/plugins/$(PLUGIN_NAME)/$(NC)"
	@echo ""
	@echo "Restart Obsidian or reload plugins to see changes"
