# PostgreSQL Local Setup

## Installation (macOS)

```bash
# Install PostgreSQL 15
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15

# Add to PATH (add to ~/.zshrc)
export PATH="/usr/local/opt/postgresql@15/bin:$PATH"
```

## Database Setup

```bash
# Create the database
createdb Quake_inventory

# Verify connection
psql -d Quake_inventory -c "SELECT 1;"
```

## Configuration

Update your `.env` file with:

```env
POSTGRES_DB=Quake_inventory
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

## Common Commands

```bash
# Connect to database
psql -d Quake_inventory

# List all databases
psql -l

# Stop PostgreSQL service
brew services stop postgresql@15
```
