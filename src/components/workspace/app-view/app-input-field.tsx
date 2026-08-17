"use client";

import { useTranslations } from "next-intl";
import { Label, Textarea } from "tongflow/canvas";
import { AppFileInput } from "./app-file-input";
import {
    type AppFieldValue,
    type AppFormField,
    fieldHasValue,
} from "./use-app-form-model";

export function AppInputField({
    field,
    onChange,
    disabled,
}: {
    field: AppFormField;
    onChange: (patch: AppFieldValue) => void;
    disabled?: boolean;
}) {
    const t = useTranslations("Workspace.appView");

    const label = field.label?.trim() || t(`fieldType.${field.dataType}`);
    const missing = field.required && !fieldHasValue(field);

    return (
        <div className="space-y-1.5">
            <Label className="text-sm">
                {label}
                {missing && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            {field.dataType === "text" ? (
                <Textarea
                    value={field.value.texts?.[0] ?? ""}
                    onChange={(e) => onChange({ texts: [e.target.value] })}
                    placeholder={t("textPlaceholder")}
                    rows={3}
                    disabled={disabled}
                    className="resize-y"
                />
            ) : (
                <AppFileInput
                    dataType={field.dataType}
                    fileKeys={field.value.fileKeys ?? []}
                    onChange={(fileKeys) => onChange({ fileKeys })}
                    disabled={disabled}
                />
            )}
        </div>
    );
}
