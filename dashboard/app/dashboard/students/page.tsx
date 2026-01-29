"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { bot2Api, StudentRoster } from "@/lib/api";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";

export default function StudentsPage() {
  const [rosters, setRosters] = useState<StudentRoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    loadRosters();
  }, []);

  const loadRosters = async () => {
    setLoading(true);
    try {
      const response = await bot2Api.listRoster({ page_size: "100" });
      if (response.data) {
        setRosters(response.data.results);
        setTotalCount(response.data.count);
      }
    } catch (error) {
      console.error("Error loading rosters:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Rostdan ham o'chirmoqchimisiz?")) return;

    try {
      await bot2Api.deleteRoster(id);
      await loadRosters();
    } catch (error) {
      console.error("Error deleting roster:", error);
      alert("O'chirishda xatolik yuz berdi");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Talabalar</h2>
          <p className="text-muted-foreground">
            Jami {totalCount} ta talaba ro&apos;yxatga olingan
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/students/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Talaba qo&apos;shish
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Talabalar ro&apos;yxati
          </CardTitle>
          <CardDescription>
            Barcha ro&apos;yxatga olingan talabalar ma&apos;lumotlari
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Yo&apos;nalish</TableHead>
                  <TableHead className="text-center">Kurs</TableHead>
                  <TableHead className="text-center">Kampaniya</TableHead>
                  <TableHead className="text-center">Holat</TableHead>
                  <TableHead className="text-right">Amallar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rosters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Ma&apos;lumot topilmadi
                    </TableCell>
                  </TableRow>
                ) : (
                  rosters.map((roster) => (
                    <TableRow key={roster.id}>
                      <TableCell className="font-medium">
                        {roster.student_external_id}
                      </TableCell>
                      <TableCell>
                        {roster.program_details?.name || roster.program}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {roster.course_year}-kurs
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {roster.roster_campaign}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {roster.is_active ? (
                          <Badge variant="default">Aktiv</Badge>
                        ) : (
                          <Badge variant="destructive">Aktiv emas</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(`/dashboard/students/${roster.id}`)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(roster.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
