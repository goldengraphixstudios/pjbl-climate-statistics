# Statistics Meets Climate Action - Learning Platform

A comprehensive, project-based learning platform integrating climate science with high school statistics education. Features interactive lessons, assessments, and real-time analytics for students, teachers, and administrators. Built with React, TypeScript, Vite, and Supabase.

## Overview

This platform provides a digitized project-based learning (PJBL) experience that connects core statistics concepts with climate action. Students analyze real climate datasets from the Davao Region to understand correlation analysis, linear regression, and prediction modeling while developing critical thinking and problem-solving skills.

**Key Focus**: Pearson's correlation coefficient, regression analysis, and climate data interpretation with actionable recommendations for local environmental problems.

## Features

### Student Portal
- **Pre-Assessment**: 15-item multiple choice + 17-item Likert survey
- **Three Integrated Lessons**:
  - Lesson 1: Climate Correlation Analysis (understanding relationships between climate variables)
  - Lesson 2: Linear Regression Equations (slope, intercept, interpretation)
  - Lesson 3: Climate Predictions & Applications (using regression for forecasting)
- **Post-Assessment**: Parallel structure to pre-assessment for learning gains measurement
- **Performance Summary**: Overview of completion status and learning progression
- **Progress Tracking**: Real-time section completion gates and visual progress bars
- **Interactive Activities**: Phase-based lessons with formative assessments and feedback

### Teacher Portal
- **Class Management**: Create, edit, and delete classes by grade and section
- **Student Enrollment**: Bulk add students with auto-generated credentials (username_password format)
- **Progress Monitoring**: Track student completion across sections and activities
- **Performance Analytics**: View assessment scores, survey responses, and learning gains
- **Feedback System**: Provide targeted feedback on student responses
- **CSV Export**: Download assessment results and student data for further analysis

### Administrator Portal
- **Comprehensive Analytics**: 
  - Pre-Assessment Results with item analysis and group scoring
  - Initial Survey Results (learning attitudes and self-efficacy)
  - Post-Assessment Results with learning gains
  - End-of-Lesson Survey tracking
- **Section Filtering**: View data by class section
- **Report Generation**: Export assessment data and survey results to CSV
- **Aggregate Statistics**: Mean scores, response distributions, and indicator-level analysis

### Technical Features
- **Role-Based Access Control**: Student, Teacher, and Admin roles with appropriate permissions
- **Responsive Design**: Mobile, tablet, and desktop optimization
- **Local & Supabase Auth**: Hybrid authentication with fallback to localStorage for development/testing
- **Real-Time Data Sync**: Supabase integration for persistent data across sessions
- **IndexedDB Support**: Graceful fallback when localStorage is unavailable
- **Error Boundary**: Graceful error handling for lesson rendering
- **Confetti Celebration**: Visual feedback for section completion
- **Progress Persistence**: Multi-method data storage (localStorage, IndexedDB, Supabase)

## Test Credentials

### Teacher Login
- **Username**: teacher01
- **Password**: cbnhs

### Administrator Login
- **Username**: sirmarco
- **Password**: 101997

### Student Login
Default student credentials (built-in for testing):
- **Username**: john_doe | **Password**: doe123
- **Username**: jane_smith | **Password**: smith456
- **Username**: student_001 | **Password**: pass001
- **Username**: test_user | **Password**: testpass123

Additional student credentials can be created through the Teacher Portal. Students can log out from the Student Dashboard and log back in with different credentials.

## Project Structure

```
src/
├── pages/
│   ├── LandingPage.tsx                    # Role selection interface
│   ├── auth/
│   │   ├── StudentLogin.tsx               # Student authentication
│   │   ├── TeacherLogin.tsx               # Teacher/Admin authentication
│   │   └── AdminLogin.tsx                 # Direct admin bypass login
│   ├── portals/
│   │   ├── CombinedPortal.tsx             # Role-based portal router
│   │   ├── StudentPortal.tsx              # Student dashboard (sections, progress)
│   │   ├── TeacherPortal.tsx              # Teacher class/feedback management
│   │   ├── AdminPortal.tsx                # Analytics and reporting
│   │   └── PerformanceSummary.tsx         # Aggregate performance data
│   └── student_sections/
│       ├── PreAssessment.tsx              # Pre-assessment (MC + Survey)
│       ├── Lesson1.tsx                    # Correlation Analysis lesson
│       ├── Lesson2.tsx                    # Linear Regression lesson
│       ├── Lesson3.tsx                    # Predictions & Applications lesson
│       ├── PostAssessment.tsx             # Post-assessment (MC + Survey)
│       └── PerformanceSummary.tsx         # Student performance overview
├── components/
│   ├── ProgressBar.tsx                    # Visual progress indicator
│   ├── ErrorBoundary.tsx                  # Error handling wrapper
│   ├── ConfettiOverlay.tsx                # Completion celebration
│   ├── RoleIcons.tsx                      # SVG icon components
│   ├── BarDualChart.tsx                   # Dual-axis chart component
│   ├── teacher/
│   │   ├── ClassManagement.tsx            # Class CRUD operations
│   │   ├── StudentList.tsx                # Student enrollment & management
│   │   ├── FeedbackPanel.tsx              # Feedback input interface
│   │   └── LoginStatusChart.tsx           # Login analytics visualization
│   └── admin/
│       └── AnalyticsChart.tsx             # Statistical charts & graphs
├── services/
│   ├── authService.ts                     # Credential validation & registration
│   ├── supabaseClient.ts                  # Supabase auth & client setup
│   ├── progressService.ts                 # Student progress tracking & scoring
│   ├── responsesService.ts                # Activity response storage & retrieval
│   ├── feedbackService.ts                 # Teacher feedback management
│   ├── profilesService.ts                 # User profile queries
│   ├── classService.ts                    # Class & student data management
│   ├── lesson1Phase1Data.ts               # Lesson 1 activity data
│   └── activity2Questions.ts              # Lesson activity question banks
├── styles/
│   ├── App.css                            # Global styles
│   ├── LandingPage.css                    # Landing page styling
│   ├── Auth.css                           # Login form styles
│   ├── StudentPortal.css                  # Student dashboard styles
│   ├── TeacherPortal.css                  # Teacher portal styles
│   ├── AdminPortal.css                    # Admin dashboard styles
│   ├── Lesson.css                         # Lesson content styles
│   ├── PreAssessment.css                  # Assessment styling
│   ├── ProgressBar.css                    # Progress indicator styles
│   ├── ClassManagement.css                # Class management UI
│   ├── StudentList.css                    # Student list styling
│   ├── AnalyticsChart.css                 # Chart styling
│   ├── LoginStatusChart.css               # Login chart styling
│   ├── Confetti.css                       # Celebration animation
│   └── PreventScroll.css                  # Modal overflow handling
├── App.tsx                                # Main app router & state
└── main.tsx                               # React entry point
```

## Data Model

### User Roles
- **Student**: Access lessons, assessments, and view personal progress
- **Teacher**: Manage classes, enroll students, view student performance, provide feedback
- **Admin**: View system-wide analytics, generate reports, oversee all classes

### Assessment Structure
- **Pre-Assessment Part 1**: 15 multiple-choice questions (3 learning competency groups)
- **Pre-Assessment Part 2**: 17-item Likert survey (3 indicators of learning attitudes)
- **Post-Assessment**: Parallel structure to pre-assessment
- **Lesson Assessments**: Formative activities with immediate feedback

### Student Progress Tracking
- Section completion (0-100% per section)
- Assessment scores (raw + group scores)
- Likert responses (1-5 scale)
- Feedback acknowledgment status
- Login tracking (first login date)

## Database Schema (Supabase)

- **users**: User profiles, roles, contact info
- **classes**: Class records by section/grade
- **class_students**: Student enrollment mapping
- **student_responses**: Activity response data with timestamps
- **student_feedback**: Teacher feedback on activities
- **student_progress**: Progress tracking & completion status

## Installation

1. **Install dependencies**:
```bash
npm install
```

2. **Set up environment variables** (create `.env` file):
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

3. **Start development server**:
```bash
npm run dev
```

4. **Open in browser**: Navigate to `http://localhost:5173`

## Building for Production

```bash
npm run build
npm run preview
```

Deploy the `dist/` directory to your hosting service.

## Technologies Used

- **React 18** - UI library
- **TypeScript** - Type safety and development experience
- **Vite** - Build tool, dev server, and module bundler
- **Supabase** - Backend as a Service (authentication, database, real-time)
- **Tailwind/CSS3** - Responsive styling with modern design
- **localforage** - Persistent storage with IndexedDB fallback
- **xlsx** - Excel/CSV data export
- **Puppeteer** - Automated testing/PDF generation capability

## Development Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
npm run deploy    # Build and deploy to GitHub Pages
```

## Project Information

- **Title**: Statistics Meets Climate Action - A Digitized Project-Based Learning Material
- **Subject**: Senior High School Statistics with Climate Education Integration
- **Competencies**: Pearson's correlation analysis (M11/12SP-IVh-2 & 3), Linear regression (M11/12SP-IVi-3 & 4), Data prediction (M11/12SP-IVj-1 & 2)
- **Region**: Davao Region (Philippines) climate data

## Proponent Information

- **Developer**: Mr. Marco R. Ocumen
- **Program**: Master of Arts in Mathematics Education
- **Institution**: University of Southeastern Philippines
- **Year**: 2024

## Key Features Implemented

✅ Role-based authentication (Student, Teacher, Admin)
✅ Three interactive lessons with embedded activities
✅ Pre and post-assessments with surveys
✅ Real-time progress tracking and visualization
✅ Teacher feedback system
✅ Comprehensive admin analytics
✅ CSV report generation
✅ Responsive mobile design
✅ Multi-method data persistence (localStorage, IndexedDB, Supabase)
✅ Confetti celebration on section completion

## Known Limitations & Future Enhancements

- PDF report generation (infrastructure ready, pending implementation)
- Email notifications (infrastructure ready)
- Real-time collaboration features
- Advanced adaptive learning paths
- Mobile app version
- Integration with Learning Management Systems (LMS)
