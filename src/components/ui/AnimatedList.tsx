'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

export const itemVariants = {
  hidden:  { opacity: 0, y: -10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'circOut' as const } },
}

export function AnimatedList({
  children,
  className,
  listKey,
}: {
  children: ReactNode
  className?: string
  listKey?: string | number
}) {
  // Unique per-mount ID so the stagger re-fires every time this component mounts
  // (i.e. every tab switch), regardless of SWR cache state.
  const [mountId] = useState(() => Date.now())

  return (
    <motion.div
      key={listKey ?? mountId}
      variants={listVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  )
}
