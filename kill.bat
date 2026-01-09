  @echo off
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /F /PID %%a
  echo Port 3001 freed!