"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Eye, RefreshCw, Search, GraduationCap } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import { formatUzPhone } from "@/lib/utils";
import {
  bot1Api,
  PolitoAcademyRequest,
  formatDate,
  getItemName,
  getApplicantName,
} from "@/lib/api";

export default function PolitoAcademyPage() {
  const [requests, setRequests] = useState<PolitoAcademyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const reqRes = await bot1Api.listPolito();
      if (reqRes.error) throw new Error(reqRes.error.message as string);

      const reqs = reqRes.data?.results || [];
      setRequests(reqs);
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

  const filteredReqs = requests.filter((req) => {
    if (!search) return true;
    const applicant = req.applicant_details;
    const subject = req.subject_details;
    const searchLower = search.toLowerCase();
    return (
      applicant?.first_name?.toLowerCase().includes(searchLower) ||
      applicant?.last_name?.toLowerCase().includes(searchLower) ||
      applicant?.phone?.includes(search) ||
      getItemName(subject)?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Polito Academy</h1>
          <p className="text-muted-foreground">Polito Academy arizalari</p>
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
                Jami: {requests.length} ta ariza
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
                    <TableHead>Fan</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Hudud</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="w-[80px]">Amal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReqs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-muted-foreground"
                      >
                        Ma'lumot topilmadi
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReqs.map((req) => {
                      const applicant = req.applicant_details;
                      const subject = req.subject_details;
                      const region = applicant?.region_details;

                      return (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">
                            {getApplicantName(applicant)}
                          </TableCell>
                          <TableCell>
                            {subject ? (
                              <Badge
                                variant="outline"
                                className="flex items-center gap-1 w-fit"
                              >
                                <GraduationCap className="h-3 w-3" />
                                {getItemName(subject)}
                              </Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {formatUzPhone(applicant?.phone) || "-"}
                          </TableCell>
                          <TableCell>{applicant?.email || "-"}</TableCell>
                          <TableCell>{getItemName(region)}</TableCell>
                          <TableCell>
                            <StatusBadge status={req.status} />
                          </TableCell>
                          <TableCell>
                            {formatDate(req.submitted_at || req.created_at)}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/dashboard/applications/polito/${req.id}`}
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
