export type PricePoint = { block_number: number; timestamp: string; price: string };

export type RawPool = {
  netuid: number;
  block_number: number;
  timestamp: string;
  name: string;
  symbol: string;
  market_cap: string;
  liquidity: string;
  total_tao: string;
  total_alpha: string;
  price: string;
  rank: number;
  startup_mode: boolean;
  root_prop: string;
  price_change_1_hour: string;
  price_change_1_day: string;
  price_change_1_week: string;
  price_change_1_month: string;
  tao_volume_24_hr: string;
  buys_24_hr: number;
  sells_24_hr: number;
  seven_day_prices?: PricePoint[];
};

export type RawSubnetMeta = {
  netuid: number;
  block_number: number;
  registration_block_number: number | null;
  registration_timestamp: string;
  registration_cost: string;
  neuron_registration_cost: string;
  emission: string;
  projected_emission: string;
  immunity_period: number;
  active_keys: number;
  active_validators: number;
  active_miners: number;
  max_neurons: number;
  blocks_until_next_adjustment: number | string;
  adjustment_interval: number | string;
  target_regs_per_interval: number;
  neuron_registrations_this_interval: number;
  tempo: number;
  blocks_since_last_step: number | string;
  registration_allowed: boolean;
  min_burn: string;
  max_burn: string;
  incentive_burn: string | null;
};

export type SubnetRow = {
  netuid: number;
  name: string;
  symbol: string;
  rank: number;
  price_tao: number;
  market_cap_tao: number;
  emission: number;
  incentive_burn: number;
  reg_cost_tao: number;
  change_10m: number;
  change_1h: number;
  change_1d: number;
  change_1w: number;
  change_1m: number;
  volume_24h_tao: number;
  buys_24h: number;
  sells_24h: number;
  sparkline: number[];
  tag: Tag;
  blocks_since_registration: number | null;
  immunity_period: number;
  immunity_blocks_left: number | null;
  startup_mode: boolean;
  root_prop: number;
  github_url?: string | null;
  website_url?: string | null;
  logo_url?: string | null;
  // TaoStats identity tags — free-form labels like "ai-model", "trading",
  // "prediction", "data", etc. Drives the type filter in the subnet
  // table and the per-subnet tag pill.
  types?: string[];
  slots_active: number;
  slots_total: number;
  regs_available: number;
  regs_target: number;
  next_reg_seconds: number | null;
  next_epoch_seconds: number | null;
  registration_allowed: boolean;
  burn_change_10m: number;
  burn_change_24h: number;
  flag?: "new" | "gained-links" | "lost-links" | "big-up" | "big-down" | null;
};

export type Tag = "Immune" | "At Risk 1" | "At Risk 2" | "At Risk 3" | null;

export type DashboardPayload = {
  subnets: SubnetRow[];
  tao_price_usd: number;
  tao_change_1h: number;
  tao_change_24h: number;
  tao_change_7d: number;
  btc_price_usd: number;
  btc_change_1h: number;
  btc_change_24h: number;
  btc_change_7d: number;
  block_number: number;
  server_time: number;
  // Root subnet epoch countdown in seconds (tempo × 12 s). Null if unknown.
  root_next_epoch_seconds: number | null;
};
