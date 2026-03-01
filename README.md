# Statistics Meets Climate Action - Learning Platform

Interactive, role-based digital learning material with dashboards for students, teachers, and administrators. Built with React, TypeScript, and Vite.

## Features

- **Landing Page**: Role selection with three primary user types
- **Student Portal**: Learning materials with progress tracking and section completion gates
- **Teacher Portal**: Class management, student enrollment, and feedback system
- **Administrator Portal**: Analytics dashboards with charts and reports
- **Responsive Design**: Optimized for laptops, tablets, and mobile devices
- **Modern UI**: Clean, academic design with Poppins font and blue color palette

## Test Credentials

### Teacher Login
- **Username**: teacher01
- **Password**: cbnhs

### Administrator Login
- **Username**: sirmarco
- **Password**: 101997

### Student Login
Sample credentials (auto-generated from teacher's student list):
- **Username**: john_doe
- **Password**: doe123

(Additional student credentials can be created through the Teacher Portal)

## Project Structure

```
src/
├── pages/
│   ├── LandingPage.tsx
│   ├── auth/
│   │   ├── StudentLogin.tsx
│   │   ├── TeacherLogin.tsx
│   │   └── AdminLogin.tsx
│   └── portals/
│       ├── StudentPortal.tsx
│       ├── TeacherPortal.tsx
│       └── AdminPortal.tsx
├── components/
│   ├── ProgressBar.tsx
│   ├── teacher/
│   │   ├── ClassManagement.tsx
│   │   ├── StudentList.tsx
│   │   └── MonitoringDashboard.tsx
│   └── admin/
│       └── AnalyticsChart.tsx
├── services/
│   └── authService.ts
├── styles/
│   ├── App.css
│   ├── LandingPage.css
│   ├── Auth.css
│   ├── StudentPortal.css
│   ├── TeacherPortal.css
│   ├── AdminPortal.css
│   ├── ProgressBar.css
│   ├── ClassManagement.css
│   ├── StudentList.css
│   ├── MonitoringDashboard.css
│   └── AnalyticsChart.css
├── App.tsx
└── main.tsx
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to

## Building for Production

```bash
npm run build
```

## Technologies Used

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **CSS3** - Styling with responsive design
- **Poppins Font** - Modern typography

## Proponent Information

- **Proponent and Developer**: Mr. Marco R. Ocumen
- **Position**: Student - Master of Arts in Mathematics Education
- **School**: University of Southeastern Philippines

## Features to Implement

- [ ] Full lesson content and activities
- [ ] Student output submission system
- [ ] Automated grading for assessments
- [ ] Backend database integration
- [ ] PDF report generation for admin
- [ ] Student performance analytics
- [ ] Real-time progress synchronization
- [ ] File download functionality
- [ ] Email notifications
