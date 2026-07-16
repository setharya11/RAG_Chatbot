"use client";

import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

// 1. Masked Text Reveal from below
interface RevealTextProps {
  children: string;
  className?: string;
  delay?: number;
}

export function RevealText({ children, className = "", delay = 0 }: RevealTextProps) {
  return (
    <span
      className={`overflow-hidden ${className}`}
      style={{
        display: "block",
        paddingTop: "0.15em",
        paddingBottom: "0.15em",
        marginTop: "-0.15em",
        marginBottom: "-0.15em",
      }}
    >
      <motion.span
        style={{ display: "inline-block", verticalAlign: "top" }}
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          duration: 0.8,
          delay,
          ease: [0.16, 1, 0.3, 1], // cinematic easeOutExpo
        }}
      >
        {children}
      </motion.span>
    </span>
  );
}

// 2. Fade Up component
interface FadeUpProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function FadeUp({ children, className = "", delay = 0 }: FadeUpProps) {
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// 3. Stagger Container for list of items
interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  delayChildren?: number;
  staggerVal?: number;
}

export function StaggerContainer({
  children,
  className = "",
  delayChildren = 0,
  staggerVal = 0.08,
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-5%" }}
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: staggerVal,
            delayChildren,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        hidden: { y: 25, opacity: 0 },
        show: {
          y: 0,
          opacity: 1,
          transition: {
            duration: 0.7,
            ease: [0.16, 1, 0.3, 1],
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// 4. Scroll Parallax Container / Image
interface ParallaxImageProps {
  src: string;
  alt: string;
  className?: string;
  containerRef?: React.RefObject<HTMLElement>;
}

export function ParallaxImage({ src, alt, className = "", containerRef }: ParallaxImageProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: targetRef,
    container: containerRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [30, -30]);

  return (
    <div ref={targetRef} className={`overflow-hidden relative ${className}`}>
      <motion.img
        src={src}
        alt={alt}
        style={{ y, scale: 1.15 }}
        className="w-full h-full object-cover"
        transition={{ ease: "linear" }}
      />
    </div>
  );
}

// 5. Scroll Scale Card
interface ScrollScaleCardProps {
  children: React.ReactNode;
  className?: string;
  containerRef?: React.RefObject<HTMLDivElement>;
  style?: React.CSSProperties;
}

export function ScrollScaleCard({ children, className = "", containerRef, style = {} }: ScrollScaleCardProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: targetRef,
    container: containerRef,
    offset: ["start end", "end start"],
  });

  // Scale subtly as it enters and leaves viewport
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.96, 1, 0.97]);
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0.75, 1, 1, 0.8]);

  return (
    <motion.div
      ref={targetRef}
      style={{ scale, opacity, ...style }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// 6. Infinite Marquee loop
interface MarqueeProps {
  items: string[];
  className?: string;
  speed?: number;
}

export function Marquee({ items, className = "", speed = 25 }: MarqueeProps) {
  return (
    <div className={`overflow-hidden flex whitespace-nowrap w-full ${className}`} style={{ maskImage: "linear-gradient(to right, transparent, white 20%, white 80%, transparent)" }}>
      <motion.div
        className="flex gap-8 pr-8"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration: speed,
        }}
      >
        {/* Render twice for seamless looping */}
        {[...items, ...items].map((item, idx) => (
          <span key={idx} className="text-sm font-semibold tracking-wider uppercase text-soft">
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// 7. Page Transition wrapper
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      {children}
    </motion.div>
  );
}
