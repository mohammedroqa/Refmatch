# Static demo deployment

## GitHub Pages publication

The `gh-pages` branch contains the published site. Run `npm ci` followed by
`npm run build:static` to build all pages, including the Evaluation Lab, from
tracked source. No previous-release artifact is required. Copy the complete
`dist/` contents into a fresh worktree of `gh-pages`, review the diff, commit and
push. Preserve `.nojekyll` and verify the release manifest.

GitHub Pages should publish from `gh-pages` at the repository root. The site is
`https://mohammedroqa.github.io/Refmatch/`; the Evaluation Lab is at
`https://mohammedroqa.github.io/Refmatch/demo/eval.html`. Confirm the Pages deployment
and live URL after pushing when network access permits.

The static profile supports local planning and Evaluation Lab simulations, imports,
review trails and failure inspection. Live AI calls require the local backend;
source refresh is disabled on the static site. See [Evaluation Lab 2.0](evaluation-v2.md)
for generation, private challenge handling, metrics, provider configuration and tests.

The demo can be hosted as static files by Nginx. The committee planner and saved
browser-local drafts work without a backend. The assistant and source-refresh
endpoint are intentionally disabled in this deployment profile; do not copy a
local `.env` or provider key to the web root.

## Nginx

Install Nginx, copy the repository's built static files to `/var/www/refmatch`,
and disable the packaged default site. The current production deployment uses
the Elastic IP `16.28.110.84` with a short-lived Let's Encrypt IP-address
certificate. The Nginx config redirects HTTP to HTTPS, permits ACME HTTP
challenges, rejects dotfiles, and keeps backend endpoints disabled.

Build the client bundles before copying:

```sh
npm ci
npm run build
```

Allow inbound TCP ports 80 and 443. For first-time setup, install
`deploy/nginx-bootstrap.conf` as the default site and create the ACME webroot:

```sh
sudo install -d -m 755 /var/www/certbot
```

After validating and reloading the bootstrap config, obtain the certificate:

```sh
sudo nginx -t
sudo systemctl reload nginx
sudo snap install certbot --classic
sudo certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --cert-name refmatch-ip --preferred-profile shortlived \
  --webroot -w /var/www/certbot --ip-address 16.28.110.84
```

Install `deploy/nginx.conf` as the default site after certificate issuance.
It enables TLS 1.2/1.3 and the site's security headers. IP-address certificates
are short-lived (about six days), so unattended Certbot renewal is essential.
The server-side assistant and refresh endpoints remain disabled; do not copy a
local `.env` or provider key to the web root. Validate, reload, install the
renewal hook, and check renewal:

```sh
sudo nginx -t
sudo systemctl reload nginx
sudo install -D -m 755 deploy/reload-nginx /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
sudo certbot renew --dry-run
```

For an enduring DNS target, associate an Elastic IP with the instance first;
otherwise a stop/start can change its public IP. A custom domain and regular
domain certificate are preferable for a stable public URL and certificate
lifecycle; update the Nginx server name and certificate paths when switching.

## Secure URL

The current IP-based secure URL is `https://16.28.110.84/`. Some browsers may
not yet trust IP-address certificates; use a domain with a regular certificate
for broader compatibility.
