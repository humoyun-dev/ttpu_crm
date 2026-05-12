"use client";

import Link from "next/link";
import { Users, ArrowRight, BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const analyticsCategories = [
  {
    title: "So'rovnoma",
    description: "Talabalar so'rovnomasi va bandlik statistikasi",
    href: "/dashboard/analytics/surveys",
    icon: Users,
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-50 dark:bg-pink-950",
  },
  {
    title: "Talabalar soni",
    description: "Umumiy talabalar soni va qamrov ko'rsatkichlari",
    href: "/dashboard/analytics/enrollments",
    icon: BarChart3,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-950",
  },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-8 w-8 text-primary" />
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analitika</h2>
          <p className="text-muted-foreground">
            Statistika va tahlillar
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {analyticsCategories.map((category) => {
          const Icon = category.icon;
          return (
            <Link key={category.href} href={category.href}>
              <Card className="group cursor-pointer hover:shadow-lg transition-all duration-200 h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div
                      className={`p-3 rounded-lg ${category.bgColor} transition-transform group-hover:scale-110`}
                    >
                      <Icon className={`h-6 w-6 ${category.color}`} />
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <CardTitle className="mt-4">{category.title}</CardTitle>
                  <CardDescription>{category.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Batafsil ma&apos;lumot uchun bosing
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analitika haqida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ushbu bo&apos;limda siz quyidagi statistik ma&apos;lumotlarni ko&apos;rishingiz mumkin:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Talabalar so&apos;rovnomasi va bandlik ma&apos;lumotlari
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Dasturlar bo&apos;yicha qamrov va ishtirok foizlari
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Kurs yillari bo&apos;yicha talabalar soni dinamikasi
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
