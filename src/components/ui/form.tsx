import * as React from "react";

import { Alert } from "@/components/ui/alert";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";

function FormField({ children, ...props }: React.ComponentProps<typeof Field>) {
  const content = React.Children.toArray(children);
  const isInvalid = content.some((child) => {
    if (!React.isValidElement<{ "aria-invalid"?: boolean }>(child)) {
      return false;
    }

    return Boolean(child.props["aria-invalid"]);
  });

  return (
    <Field data-invalid={isInvalid || undefined} {...props}>
      {content.map((child, index) => {
        if (typeof child === "string") {
          return <FieldLabel key={index}>{child}</FieldLabel>;
        }

        if (
          React.isValidElement<React.ComponentProps<"p">>(child) &&
          child.type === "p" &&
          child.props.className?.includes("text-destructive")
        ) {
          return (
            <FieldError key={index} className={child.props.className}>
              {child.props.children}
            </FieldError>
          );
        }

        return child;
      })}
    </Field>
  );
}

function FormSection({
  title,
  children,
  ...props
}: React.ComponentProps<typeof FieldSet> & { title: React.ReactNode }) {
  return (
    <FieldSet {...props}>
      <FieldLegend>{title}</FieldLegend>
      <FieldGroup>{children}</FieldGroup>
    </FieldSet>
  );
}

function FormInfoPanel(props: React.ComponentProps<typeof Alert>) {
  return <Alert {...props} />;
}

export { FormField, FormInfoPanel, FormSection };
