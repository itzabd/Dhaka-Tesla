# Dhaka Tesla Pool

Autonomous corridor-based urban electric rideshare pooling platform for Dhaka.

## Production Deployments

- **Frontend (Vercel):** [https://dhaka-tesla-phi.vercel.app](https://dhaka-tesla-phi.vercel.app)
- **Backend API (Render):** [https://dhaka-tesla-ixn2.onrender.com](https://dhaka-tesla-ixn2.onrender.com)
- **Database (Neon Serverless Postgres):** Singapore region (AWS `ap-southeast-1`)

## Rollback

### Render
Deploys tab → find the last working deploy → "Redeploy".

### Vercel
Deployments tab → find the last working deploy → "Promote to Production".

### Neon
The free tier retains point-in-time snapshots for 7 days. The database can
be reset to a snapshot from the Neon dashboard if a bad migration corrupts
the schema.
