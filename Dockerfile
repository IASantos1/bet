# Build image for Railway. The base comes from the AWS mirror of Docker's official images
# (public.ecr.aws/docker/library), not from Docker Hub, whose anonymous pull limit (429 Too Many
# Requests) was failing the builds.
FROM public.ecr.aws/docker/library/node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

CMD ["npm", "start"]
