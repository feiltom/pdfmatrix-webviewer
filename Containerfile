# Development and CI image: Node.js plus the browsers used by the Playwright tests.
FROM mcr.microsoft.com/playwright:v1.64.0-noble AS dev
WORKDIR /app
ENV CI=1
