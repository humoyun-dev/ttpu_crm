"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Eye,
  RefreshCw,
  Search,
  ClipboardList,
  CheckCircle,
  XCircle,
} from "lucide-react";
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
import { GenderBadge } from "@/components/status-badge";
import { TableLoading } from "@/components/loading";
import { ErrorDisplay } from "@/components/error-display";
import {
  bot2Api,
  Bot2SurveyResponse,
  Bot2Student,
  formatDate,
} from "@/lib/api";

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Bot2SurveyResponse[]>([]);
  const [students, setStudents] = useState<Record<string, Bot2Student>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const surveyRes = await bot2Api.listSurveys();
      if (surveyRes.error) throw new Error(surveyRes.error.message as string);

      const surveyList = surveyRes.data?.results || [];
      setSurveys(surveyList);

      // Fetch students
      const studentRes = await bot2Api.listStudents();
      const studentMap: Record<string, Bot2Student> = {};
      if (studentRes.data?.results) {
        studentRes.data.results.forEach((st) => {
          studentMap[st.id] = st;
        });
      }
      setStudents(studentMap);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ma'lumotlarni yuklab bo'lmadi"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredSurveys = surveys.filter((survey) => {
    if (!search) return true;
    const student = students[survey.student];
    const searchLower = search.toLowerCase();
    return (
      student?.first_name?.toLowerCase().includes(searchLower) ||
      student?.last_name?.toLowerCase().includes(searchLower) ||
      student?.student_external_id?.toLowerCase().includes(searchLower) ||
      survey.survey_campaign?.toLowerCase().includes(searchLower)
    );
  });

  // Group surveys by campaign
  const campaigns = [...new Set(surveys.map((s) => s.survey_campaign))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">So'rovnomalar</h1>
          <p className="text-muted-foreground">
            Talabalar so'rovnomalari natijalari
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Yangilash
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jami javoblar</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{surveys.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kampaniyalar</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tugallangan</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {surveys.filter((s) => s.is_complete).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tugallanmagan</CardTitle>
            <XCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {surveys.filter((s) => !s.is_complete).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>So'rovnomalar ro'yxati</CardTitle>
              <CardDescription>Jami: {surveys.length} ta javob</CardDescription>
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
                    <TableHead>Student ID</TableHead>
                    <TableHead>Kampaniya</TableHead>
                    <TableHead>Kurs</TableHead>
                    <TableHead>Jins</TableHead>
                    <TableHead>Holat</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="w-[80px]">Amal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSurveys.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-muted-foreground"
                      >
                        Ma'lumot topilmadi
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSurveys.map((survey) => {
                      const student = students[survey.student];

                      return (
                        <TableRow key={survey.id}>
                          <TableCell className="font-medium">
                            {student
                              ? `${student.first_name} ${student.last_name}`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {student?.student_external_id || "-"}
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {survey.survey_campaign || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {survey.course_year
                              ? `${survey.course_year}-kurs`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <GenderBadge
                              gender={student?.gender || "unspecified"}
                            />
                          </TableCell>
                          <TableCell>
                            {survey.is_complete ? (
                              <Badge variant="default" className="bg-green-500">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Tugallangan
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <XCircle className="h-3 w-3 mr-1" />
                                Jarayonda
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{formatDate(survey.created_at)}</TableCell>
                          <TableCell>
                            <Link href={`/dashboard/surveys/${survey.id}`}>
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
