import { useEffect, useState } from 'react'
import { fallbackCourse } from '../data/fallbackCourse'
import { getActiveCourse } from '../services/courseService'

export function useCourse() {
  const [course, setCourse] = useState(fallbackCourse)
  useEffect(() => { getActiveCourse().then(({ data }) => setCourse(data)).catch(() => {}) }, [])
  return course
}
