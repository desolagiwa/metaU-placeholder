/*
  Warnings:

  - You are about to drop the column `delayedMin` on the `trips` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "trips" DROP COLUMN "delayedMin",
ADD COLUMN     "delayMin" INTEGER;
