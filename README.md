# Inside Amelia Rescue

Member management system for Amelia Rescue Squad.

## Data Model

```
┌───────────────────────────────────────────────────────────────────┐
│                              USER                                 │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ • user_id                                                   │  │
│  │ • first_name, last_name, email, phone                       │  │
│  │ • website_role (admin | user)                               │  │
│  │ • profile_picture_url                                       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Has many MEMBERSHIP ROLES (role-track assignments):              │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │ • role_name          ──────┐                             │     │
│  │ • track_name         ──────┼──┐                          │     │
│  │ • precepting (boolean)     │  │                          │     │
│  └────────────────────────────┼──┼──────────────────────────┘     │
└────────────────────────────────┼──┼───────────────────────────────┘
                                 │  │
                    ┌────────────┘  └────────────┐
                    │                            │
                    ▼                            ▼
         ┌──────────────────┐          ┌──────────────────┐
         │      ROLE         │          │      TRACK      │
         ├──────────────────┤          ├──────────────────┤
         │ • name            │          │ • name           │
         │ • description     │          │ • description    │
         │ • allowed_tracks[]│──────────│ • required_      │
         └──────────────────┘          │   certifications[]│
                                       └──────────┬────────┘
                                                  │
                                                  │ References
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │ CERTIFICATION TYPE   │
                                       ├──────────────────────┤
                                       │ • name               │
                                       │ • description        │
                                       └──────────┬───────────┘
                                                  │
                                                  │ Has many
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │   CERTIFICATION      │
                                       ├──────────────────────┤
                                       │ • user_id            │
                                       │ • certification_     │
                                       │   type_name          │
                                       │ • issued_on          │
                                       │ • expires_on         │
                                       │ • file_url           │
                                       └──────────────────────┘

Example Flow:
  1. User "John Doe" has membership_role: { role_name: "Provider", 
     track_name: "EMT", precepting: false }
  2. Role "Provider" allows tracks: ["EMT", "ALS", "BLS"]
  3. Track "EMT" requires certifications: ["CPR", "EMT-Basic"]
  4. User must have Certifications for "CPR" and "EMT-Basic" to be cleared
  5. If precepting: true, user is training/precepting for that track
```

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
