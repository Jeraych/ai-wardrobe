# AI Wardrobe

AI Wardrobe is a full-stack wardrobe and outfit planning app. Users can sign in, complete onboarding, manage closet items, build outfits, save favourites, and generate virtual try-on previews from their profile/model image and selected clothing.

## Features

- Auth0 login and signup.
- Centered onboarding for body profile, optional style preferences, and model image setup.
- Profile management for display name, required age/gender body profile fields, optional measurements/body shape, style preferences, and profile/model photo upload.
- Closet management for adding, editing, searching, and uploading clothing item images.
- Outfit builder and saved outfit library with favourite outfit support.
- AI virtual try-on generation using Replicate, with generated images stored through Cloudinary.
- Upload guideline modals for profile and clothing images.

## Screenshots

### Home Dashboard

![AI Wardrobe home dashboard](screenshot/home.png)

### Closet

![Closet item grid](screenshot/closetg.png)

### Closet Item Details

![Closet item details panel](screenshot/closet.png)

### Saved Outfits

![Saved outfits and virtual try-on preview](screenshot/outfits.png)

### Profile

![Profile and style preferences](screenshot/profile.png)

### Onboarding Model Selection

![Onboarding model selection](screenshot/onboard.png)

### Login and Registration

![Auth0 login and registration](screenshot/login.png)

## Architecture

This repository is a monorepo with a Next.js frontend and an Express/MongoDB backend.

- `frontend/`: Next.js App Router, React, TypeScript, Tailwind CSS v4, Auth0 client integration, onboarding/profile/closet/outfit UI.
- `backend/`: Express REST API, Auth0 JWT validation, MongoDB/Mongoose models, Cloudinary uploads, Replicate try-on route, Jest/Supertest tests.
- Root package: shared scripts for running the frontend and backend together.

The frontend requests Auth0 access tokens and sends them to the backend. The backend validates those tokens, stores user/closet/outfit data in MongoDB, uploads images to Cloudinary, and calls Replicate for try-on generation.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS v4
- Node.js
- Express
- MongoDB and Mongoose
- Auth0
- Cloudinary
- Replicate
- Vitest
- Jest and Supertest

## Prerequisites

- Node.js
- MongoDB, either local or Atlas
- Auth0 tenant and API audience
- Cloudinary account
- Replicate API token

## Quick Start

1. Install dependencies:

```bash
npm install
cd frontend && npm install
cd ../backend && npm install
cd ..
```

2. Create the environment files:

- `backend/.env`
- `frontend/.env`

Use the examples in the Setup section below.

3. Start MongoDB if you are using a local database.

4. Start the app from the repository root:

```bash
npm run dev
```

5. Open the frontend:

```text
http://localhost:3000
```

The backend runs at:

```text
http://localhost:5000
```

## Setup

Install dependencies from the repository root:

```bash
npm install
cd frontend && npm install
cd ../backend && npm install
cd ..
```

Create `backend/.env`:

```env
MONGO_URI=mongodb://127.0.0.1:27017/ai-wardrobe
PORT=5000
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://your-api-audience
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
REPLICATE_API_TOKEN=your_replicate_token
```

Create `frontend/.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
AUTH0_SECRET=your_auth0_secret
APP_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_AUDIENCE=https://your-api-audience
AUTH0_SCOPE=openid profile email
```

## Running The App

Start both servers from the root:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:backend
npm run dev:frontend
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

## Scripts

Root scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start frontend and backend together |
| `npm run dev:frontend` | Start the frontend dev server |
| `npm run dev:backend` | Start the backend dev server |

Frontend scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Build the frontend for production |
| `npm run start` | Serve the production frontend |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest tests |

Backend scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API with nodemon |
| `npm start` | Start the API with Node.js |
| `npm test` | Run Jest/Supertest tests |

## Testing

Run frontend tests:

```bash
cd frontend
npm test
```

Run frontend type checks and lint:

```bash
cd frontend
npx tsc --noEmit
npm run lint
```

Run backend tests:

```bash
cd backend
npm test
```

## Frontend Routes

| URL | Page |
| --- | --- |
| `/login` | Auth0 sign-in entry point |
| `/signup` | Centered Auth0 sign-up entry point |
| `/onboarding` | Onboarding flow after Auth0 sign-in |
| `/` | Home dashboard with wardrobe stats and outfit generation entry points |
| `/closet` | Searchable closet item grid, item details, add/edit item flows |
| `/closet?addItem=1` | Opens the add clothing item modal |
| `/outfits` | Saved outfit library with favourite outfit support |
| `/outfits/builder` | Create or edit outfits from closet items |
| `/profile` | Profile details, body profile, style preferences, and photo upload |
| `/components` | Component showcase |

## Onboarding And Auth

- `/signup` and `/login` use centered single-column auth layouts.
- `/onboarding?step=body-profile` collects first name, last name, age, and gender as required fields. Measurements and body shape are optional.
- `/onboarding?step=about-yourself` allows users to select style preferences or skip with an empty style preference list.
- `/onboarding?step=select-model` lets users upload a photo or choose a default model. Uploaded photos preview inside the drag-and-drop box.

## Backend API Routes

| Method | URL | What it does |
| --- | --- | --- |
| `GET` | `/` | Health check |
| `POST` | `/api/users/me/sync` | Create the authenticated user's MongoDB profile if missing |
| `GET` | `/api/users/me` | Get the authenticated user's profile |
| `PUT` | `/api/users/me` | Replace/update the authenticated user's profile |
| `PATCH` | `/api/users/me/profile` | Update editable profile fields |
| `PATCH` | `/api/users/me/body-profile` | Update body profile fields |
| `PATCH` | `/api/users/me/style-preferences` | Update style preferences |
| `PUT` | `/api/users/me/photo` | Update the profile photo URL |
| `POST` | `/api/users/me/photo/upload` | Upload a user profile/model image |
| `DELETE` | `/api/users/me` | Delete the authenticated user's profile |
| `POST` | `/api/clothingItems/me` | Create a clothing item |
| `GET` | `/api/clothingItems/me` | List the authenticated user's clothing items |
| `PUT` | `/api/clothingItems/me/:id` | Update a clothing item |
| `DELETE` | `/api/clothingItems/me/:id` | Delete a clothing item |
| `POST` | `/api/clothingItems/me/:id/image` | Upload an image for a clothing item |
| `POST` | `/api/outfits/me` | Create an outfit |
| `GET` | `/api/outfits/me` | List outfits |
| `PUT` | `/api/outfits/me/:id` | Update an outfit |
| `DELETE` | `/api/outfits/me/:id` | Delete an outfit |
| `POST` | `/api/tryon` | Generate a virtual try-on image with Replicate |

Authenticated backend routes require:

```http
Authorization: Bearer <access_token>
```

## API Conventions

- Request and response bodies are JSON unless uploading images.
- Clothing item categories are `upper_body`, `lower_body`, `dresses`, `outerwear`, `shoes`, or `accessories`.
- `GET /api/clothingItems/me` supports query filters for owned closet data.
- Outfit item IDs must belong to the authenticated user.
- Outfit items must have distinct categories; duplicate item categories are rejected.
- Profile PATCH routes reject unsupported fields and run Mongoose validators before saving.
- `stylePreferences` must be an array, but it may be empty.
- Body profile measurements and body type are optional.
- Numeric body profile fields must be non-negative when provided.
- The try-on route expects a user/model image and selected outfit item images.

## Frontend Conventions

- `@/` imports use the frontend path alias.
- Reusable UI lives under `frontend/components/`.
- Authenticated API calls use `getAuthHeaders()` from `frontend/lib/api/auth.ts`.
- API URLs come from `NEXT_PUBLIC_API_URL`.
- Tailwind theme tokens are declared in `frontend/app/globals.css`.
- Logged-in app pages live under `frontend/app/(app)/`.
- Auth pages live under `frontend/app/(auth)/`.
- Onboarding lives outside the app shell at `frontend/app/onboarding/`.

## Main Data Flow

1. User signs in with Auth0.
2. Frontend obtains an access token for the backend API audience.
3. Frontend syncs the user with `POST /api/users/me/sync`.
4. User completes onboarding and saves profile/body/style/model data through `/api/users/me`.
5. Closet and outfit pages read/write authenticated user data through `/api/clothingItems/me` and `/api/outfits/me`.
6. Try-on generation sends the model image and outfit images to `/api/tryon`.
