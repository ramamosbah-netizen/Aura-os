import styles from '@/components/my-work-center.module.css';

export default function LoadingTasks() {
  return <main className={styles.page} aria-busy="true" aria-label="Loading tasks"><div className={styles.taskSkeleton} /><div className={styles.taskSkeleton} /><div className={styles.taskSkeleton} /></main>;
}
