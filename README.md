# sps Mobile

Expo mobile app for Star Public School sps teacher and student workflows.

## Features

- Teacher login with existing `/api/auth/login`
- Student login with existing `/api/student-auth/login`
- Teacher assigned class/section bootstrap
- Teacher student list for assigned section
- Teacher attendance marking and daily/month history
- Teacher marks submission for assigned class/section
- Teacher marks view by terminal
- Student profile and personal attendance summary/history

## Run

```bash
cd sps-MOBILE
npm install
npm start
```

By default the app uses the hosted backend:

```bash
https://starpublicschool.onrender.com
```

For local backend testing, override it before starting Expo:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:5000 npm start
```
