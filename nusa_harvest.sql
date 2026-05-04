-- ==========================================================
-- NUSA HARVEST — PROJECTION GRADE SQL SCHEMA (POSTGRESQL)
-- SECTION 4: DATABASE DESIGN
-- ==========================================================

-- 1. Users Table (Farmers & Investors)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(44) UNIQUE,
    role VARCHAR(20) DEFAULT 'FARMER', -- FARMER, INVESTOR, ADMIN
    phone_number VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- 2. Farms Table
CREATE TABLE farms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    region_code VARCHAR(50), -- e.g. KLATEN_JAVA
    crop_type VARCHAR(50),   -- e.g. RICE, COFFEE
    hectares DOUBLE PRECISION,
    planting_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Weather Data Table (Oracle History)
CREATE TABLE weather_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id),
    region_code VARCHAR(50),
    recorded_at TIMESTAMP NOT NULL,
    temperature_celsius FLOAT,
    rainfall_mm FLOAT NOT NULL,
    humidity_percent FLOAT,
    drought_index FLOAT, -- SPI Proxy
    data_source VARCHAR(50) DEFAULT 'OPENWEATHER_ORACLE',
    is_verified BOOLEAN DEFAULT FALSE
);

-- 4. Insurance Policies Table (On-Chain Linked)
CREATE TABLE insurance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farm_id UUID REFERENCES farms(id),
    solana_pda VARCHAR(44) UNIQUE, -- Public Key of the program account
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, TRIGGERED, EXPIRED, PAID
    premium_usdc FLOAT NOT NULL,
    max_payout_usdc FLOAT NOT NULL,
    trigger_threshold_mm FLOAT NOT NULL,
    trigger_type VARCHAR(20) DEFAULT 'RAINFALL_DEFICIT',
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Liquidity Pools Table (Investor Tranches)
CREATE TABLE yield_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) UNIQUE, -- e.g. NH-RICE
    total_tvl_usdc FLOAT DEFAULT 0,
    available_reserve_usdc FLOAT DEFAULT 0,
    total_claims_paid FLOAT DEFAULT 0,
    apy_bps INTEGER DEFAULT 1200, -- 12% basis points
    solana_program_id VARCHAR(44),
    is_paused BOOLEAN DEFAULT FALSE
);

-- 6. Investments Table
CREATE TABLE investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    pool_id UUID REFERENCES yield_pools(id),
    amount_usdc FLOAT NOT NULL,
    lp_shares_minted FLOAT,
    staked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Claims History
CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID REFERENCES insurance_policies(id),
    payout_usdc FLOAT NOT NULL,
    tx_signature VARCHAR(88), -- Solana Transaction Signature
    trigger_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'SUCCESS'
);

-- INDEXING FOR PERFORMANCE
CREATE INDEX idx_weather_region ON weather_data(region_code);
CREATE INDEX idx_policy_status ON insurance_policies(status);
CREATE INDEX idx_farm_coords ON farms(latitude, longitude);
