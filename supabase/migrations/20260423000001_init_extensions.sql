-- Enable pgvector for entry + chunk embeddings (768 dims for multilingual-e5-base)
create extension if not exists vector;

-- UUID helper
create extension if not exists "uuid-ossp";
