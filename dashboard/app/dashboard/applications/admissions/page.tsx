"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Eye, RefreshCw, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  bot1Api,
  Admissions2026Application,
  formatDate,
  getItemName,
  getApplicantName,
} from "@/lib/api";
import { formatUzPhone } from "@/lib/utils";

export default function AdmissionsPage() {
  const [applications, setApplications] = useState<Admissions2026Application[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch applications - now includes nested applicant_details and direction_details
      const appRes = await bot1Api.listAdmissions();
      if (appRes.error) throw new Error(appRes.error.message as string);

      const apps = appRes.data?.results || [];
      setApplications(apps);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ma'lumotlarni yuklab bo'lmadi",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredApps = applications.filter((app) => {
    if (!search) return true;
    const applicant = app.applicant_details;
    const searchLower = search.toLowerCase();
    return (
      applicant?.first_name?.toLowerCase().includes(searchLower) ||
      applicant?.last_name?.toLowerCase().includes(searchLower) ||
      applicant?.phone?.includes(search) ||
      getItemName(app.direction_details).toLowerCase().includes(searchLower) ||
      app.status.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Qabul 2026</h1>
          <p className="text-muted-foreground">Talabalar qabuli arizalari</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Yangilash
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Arizalar ro'yxati</CardTitle>
              <CardDescription>
                Jami: {applications.length} ta ariza
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Qidirish..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableLoading />
          ) : error ? (
            <ErrorDisplay message={error} onRetry={fetchData} />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ism Familiya</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Yo'nalish</TableHead>
                    <TableHead>Hudud</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="w-[80px]">Amal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApps.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-muted-foreground"
                      >
                        Ma'lumot topilmadi
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredApps.map((app) => {
                      const applicant = app.applicant_details;
                      const direction = app.direction_details;
                      const region = applicant?.region_details;

                      return (
                        <TableRow key={app.id}>
                          <TableCell className="font-medium">
                            {getApplicantName(applicant)}
                          </TableCell>
                          <TableCell>
                            {formatUzPhone(applicant?.phone)}
                          </TableCell>
                          <TableCell>{applicant?.email || "-"}</TableCell>
                          <TableCell>{getItemName(direction)}</TableCell>
                          <TableCell>{getItemName(region)}</TableCell>
                          <TableCell>
                            <StatusBadge status={app.status} />
                          </TableCell>
                          <TableCell>
                            {formatDate(app.submitted_at || app.created_at)}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/dashboard/applications/admissions/${app.id}`}
                            >
                              <Button variant="ghost" size="icon">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
